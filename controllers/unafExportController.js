const asyncHandler = require('express-async-handler');
const {
  generateUNAFExcel,
  getExportsByYear,
  getUNAFStats,
  getUnexportedPayments,
  EXPORT_DATES_2026,
} = require('../services/unafExportService');
const UNAFExport = require('../models/unafExportModel');
const Service = require('../models/serviceModel');
const { getSignedUrl, downloadFile } = require('../services/s3Service');
const { envoyerEmailAvecPieceJointe } = require('../services/emailService');
const { generateAndUploadServiceAttestation, generateAndUploadEcocontributionAttestation } = require('../services/pdfService');

// Adresse email UNAF pour les envois
const UNAF_EMAIL = 'fannyarles.design+unaf@gmail.com';

// @desc    Récupérer les statistiques UNAF
// @route   GET /api/unaf-export/stats
// @access  Private/Admin
const getStats = asyncHandler(async (req, res) => {
  const { annee } = req.query;
  const year = annee ? parseInt(annee) : new Date().getFullYear();

  const stats = await getUNAFStats(year);

  res.json(stats);
});

// @desc    Récupérer la liste des exports UNAF
// @route   GET /api/unaf-export/list
// @access  Private/Admin
const getExportList = asyncHandler(async (req, res) => {
  const { annee } = req.query;
  const year = annee ? parseInt(annee) : new Date().getFullYear();

  const exports = await getExportsByYear(year);

  res.json(exports);
});

// @desc    Récupérer les paiements en attente d'export
// @route   GET /api/unaf-export/pending
// @access  Private/Admin
const getPendingPayments = asyncHandler(async (req, res) => {
  const { annee } = req.query;
  const year = annee ? parseInt(annee) : new Date().getFullYear();

  const payments = await getUnexportedPayments(year);

  res.json({
    count: payments.length,
    payments: payments.map(p => ({
      type: p.type,
      serviceId: p.serviceId,
      modificationIndex: p.modificationIndex,
      user: {
        nom: p.user?.nom || p.informations?.nom,
        prenom: p.user?.prenom || p.informations?.prenom,
        email: p.user?.email || p.informations?.email,
      },
      montant: p.montant,
      datePaiement: p.datePaiement,
      options: p.options,
    })),
  });
});

// @desc    Générer manuellement un export UNAF
// @route   POST /api/unaf-export/generate
// @access  Private/SuperAdmin
const generateExport = asyncHandler(async (req, res) => {
  // Vérification super_admin
  if (req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Accès réservé au super administrateur');
  }

  const { annee } = req.body;
  const year = annee ? parseInt(annee) : new Date().getFullYear();

  const result = await generateUNAFExcel(year, new Date());

  if (!result.success) {
    res.status(400);
    throw new Error(result.message || 'Erreur lors de la génération de l\'export');
  }

  res.json({
    message: 'Export généré avec succès',
    ...result,
  });
});

// @desc    Télécharger un export UNAF
// @route   GET /api/unaf-export/download/:id
// @access  Private/Admin
const downloadExport = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const exportRecord = await UNAFExport.findById(id);

  if (!exportRecord) {
    res.status(404);
    throw new Error('Export non trouvé');
  }

  // Générer une nouvelle URL signée
  const signedUrl = await getSignedUrl(exportRecord.s3Key, 3600);

  res.json({
    url: signedUrl,
    fileName: `UNAF_Export_${exportRecord.annee}_${exportRecord.dateExport.toISOString().split('T')[0]}.xlsx`,
  });
});

// @desc    Récupérer les dates d'export pour une année
// @route   GET /api/unaf-export/dates
// @access  Private/Admin
const getExportDates = asyncHandler(async (req, res) => {
  const { annee } = req.query;
  const year = annee ? parseInt(annee) : 2026;

  // Pour l'instant, seulement 2026 est configuré
  const dates = year === 2026 ? EXPORT_DATES_2026 : [];

  const today = new Date();
  const nextDate = dates.find(d => d > today) || null;
  const previousDate = [...dates].reverse().find(d => d < today) || null;

  res.json({
    annee: year,
    dates: dates.map(d => d.toISOString()),
    nextExportDate: nextDate?.toISOString() || null,
    previousExportDate: previousDate?.toISOString() || null,
  });
});

// @desc    Supprimer un export UNAF (uniquement si pas encore envoyé)
// @route   DELETE /api/unaf-export/:id
// @access  Private/SuperAdmin
const deleteExport = asyncHandler(async (req, res) => {
  // Vérification super_admin
  if (req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Accès réservé au super administrateur');
  }

  const { id } = req.params;

  const exportRecord = await UNAFExport.findById(id);

  if (!exportRecord) {
    res.status(404);
    throw new Error('Export non trouvé');
  }

  if (exportRecord.status === 'envoye') {
    res.status(400);
    throw new Error('Impossible de supprimer un export déjà envoyé');
  }

  // Note: On ne supprime pas le fichier S3 pour conserver l'historique
  // Mais on pourrait le faire avec deleteFile(exportRecord.s3Key)

  await UNAFExport.findByIdAndDelete(id);

  res.json({ message: 'Export supprimé avec succès' });
});

// @desc    Envoyer un export par email à l'UNAF
// @route   PUT /api/unaf-export/:id/send
// @access  Private/SuperAdmin
const sendExport = asyncHandler(async (req, res) => {
  // Vérification super_admin
  if (req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Accès réservé au super administrateur');
  }

  const { id } = req.params;

  const exportRecord = await UNAFExport.findById(id);

  if (!exportRecord) {
    res.status(404);
    throw new Error('Export non trouvé');
  }

  if (exportRecord.status === 'envoye') {
    res.status(400);
    throw new Error('Cet export a déjà été envoyé');
  }

  // Télécharger le fichier Excel depuis S3
  const fileBuffer = await downloadFile(exportRecord.s3Key);
  const fileBase64 = fileBuffer.toString('base64');

  // Formater la date de l'export
  const dateExport = new Date(exportRecord.dateExport).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Préparer le contenu de l'email
  const sujet = `Export UNAF du ${dateExport}`;
  const contenuHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #1f2937;">Export UNAF - SAR</h2>
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-joint l'export des adhésions UNAF du <strong>${dateExport}</strong>.</p>
      <p><strong>Détails de l'export :</strong></p>
      <ul>
        <li>Nombre de paiements : ${exportRecord.nombrePaiements}</li>
        <li>Montant total : ${exportRecord.montantTotal.toFixed(2)} €</li>
        <li>Premier export de l'année : ${exportRecord.isFirstExport ? 'Oui' : 'Non'}</li>
      </ul>
      <p>Cordialement,<br>SAR - Syndicat Apicole de la Réunion</p>
    </div>
  `;

  // Nom du fichier
  const fileName = `UNAF_Export_${exportRecord.annee}_${exportRecord.dateExport.toISOString().split('T')[0]}.xlsx`;

  // Envoyer l'email avec pièce jointe
  await envoyerEmailAvecPieceJointe(
    UNAF_EMAIL,
    sujet,
    contenuHtml,
    {
      content: fileBase64,
      name: fileName
    }
  );

  // Mettre à jour le statut
  exportRecord.status = 'envoye';
  exportRecord.notes = `Envoyé par email le ${new Date().toLocaleDateString('fr-FR')} à ${UNAF_EMAIL}`;
  exportRecord.dateEnvoi = new Date();
  await exportRecord.save();

  res.json({
    message: `Export envoyé avec succès à ${UNAF_EMAIL}`,
    export: exportRecord,
  });
});

// @desc    Activer les adhésions d'un export UNAF
// @route   PUT /api/unaf-export/:id/activate
// @access  Private/SuperAdmin
const activateExport = asyncHandler(async (req, res) => {
  // Vérification super_admin
  if (req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Accès réservé au super administrateur');
  }

  const { id } = req.params;

  const exportRecord = await UNAFExport.findById(id);

  if (!exportRecord) {
    res.status(404);
    throw new Error('Export non trouvé');
  }

  let activatedCount = 0;
  let errors = [];

  // Activer les services inclus (paiements initiaux)
  for (const serviceId of exportRecord.servicesInclus) {
    try {
      const service = await Service.findById(serviceId).populate('user', 'prenom nom email');
      
      if (service && service.status === 'en_attente_validation') {
        service.status = 'actif';
        service.dateValidation = new Date();
        
        // Générer l'attestation
        try {
          const attestationResult = await generateAndUploadServiceAttestation(service);
          service.attestationKey = attestationResult.key;
          service.attestationUrl = attestationResult.url;
          
          // Si écocontribution souscrite, générer aussi cette attestation
          if (service.unafData?.options?.ecocontribution?.souscrit) {
            const ecoResult = await generateAndUploadEcocontributionAttestation(service);
            service.ecocontributionAttestationKey = ecoResult.key;
            service.ecocontributionAttestationUrl = ecoResult.url;
          }
        } catch (attestationError) {
          console.error(`Erreur génération attestation service ${serviceId}:`, attestationError);
        }
        
        await service.save();
        activatedCount++;
        console.log(`✅ Service ${serviceId} activé`);
      }
    } catch (error) {
      console.error(`Erreur activation service ${serviceId}:`, error);
      errors.push({ serviceId, error: error.message });
    }
  }

  // Marquer les modifications comme exportées/traitées
  for (const modif of exportRecord.modificationsIncluses) {
    try {
      const service = await Service.findById(modif.serviceId);
      
      if (service && service.historiqueModifications[modif.modificationIndex]) {
        // Les modifications n'ont pas de status séparé, mais on peut
        // vérifier que le service parent est actif
        if (service.status === 'en_attente_validation') {
          service.status = 'actif';
          service.dateValidation = new Date();
          await service.save();
          activatedCount++;
        }
      }
    } catch (error) {
      console.error(`Erreur traitement modification:`, error);
      errors.push({ modificationIndex: modif.modificationIndex, error: error.message });
    }
  }

  // Mettre à jour l'export avec la date d'activation
  exportRecord.dateActivation = new Date();
  exportRecord.notes = (exportRecord.notes || '') + `\nAdhésions activées le ${new Date().toLocaleDateString('fr-FR')} (${activatedCount} services)`;
  await exportRecord.save();

  res.json({
    message: `${activatedCount} adhésion(s) activée(s) avec succès`,
    activatedCount,
    errors: errors.length > 0 ? errors : undefined,
  });
});

module.exports = {
  getStats,
  getExportList,
  getPendingPayments,
  generateExport,
  downloadExport,
  getExportDates,
  deleteExport,
  sendExport,
  activateExport,
};
