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
const Permission = require('../models/permissionModel');
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
// @access  Private/Permission unafServices.generateExport
const generateExport = asyncHandler(async (req, res) => {
  // Vérification de la permission unafServices.generateExport
  const userPermissions = await Permission.findOne({ userId: req.user._id });
  const hasPermission = req.user.role === 'super_admin' || userPermissions?.unafServices?.generateExport;
  
  if (!hasPermission) {
    res.status(403);
    throw new Error('Vous n\'avez pas la permission de générer un export UNAF');
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
// @access  Private/Permission unafServices.deleteExport
const deleteExport = asyncHandler(async (req, res) => {
  // Vérification de la permission unafServices.deleteExport
  const userPermissions = await Permission.findOne({ userId: req.user._id });
  const hasPermission = req.user.role === 'super_admin' || userPermissions?.unafServices?.deleteExport;
  
  if (!hasPermission) {
    res.status(403);
    throw new Error('Vous n\'avez pas la permission de supprimer un export UNAF');
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
// @access  Private/Permission unafServices.sendExport
const sendExport = asyncHandler(async (req, res) => {
  // Vérification de la permission unafServices.sendExport
  const userPermissions = await Permission.findOne({ userId: req.user._id });
  const hasPermission = req.user.role === 'super_admin' || userPermissions?.unafServices?.sendExport;
  
  if (!hasPermission) {
    res.status(403);
    throw new Error('Vous n\'avez pas la permission d\'envoyer un export UNAF');
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

  // Formater la date de l'export
  const dateExport = new Date(exportRecord.dateExport).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Préparer les pièces jointes (nouveau format avec 2 fichiers)
  const piecesJointes = [];
  let detailsFichiers = '';

  // Fichier principal (nouvelles souscriptions)
  if (exportRecord.fichierPrincipal?.s3Key) {
    const buffer = await downloadFile(exportRecord.fichierPrincipal.s3Key);
    piecesJointes.push({
      content: buffer.toString('base64'),
      name: exportRecord.fichierPrincipal.fileName || `SAR_Listingstructure${exportRecord.annee}_export.xlsx`
    });
    detailsFichiers += `
      <li><strong>Nouvelles souscriptions :</strong> ${exportRecord.fichierPrincipal.nombrePaiements} adhérent(s) - ${(exportRecord.fichierPrincipal.montantTotal || 0).toFixed(2)} €</li>
    `;
  }

  // Fichier complément (modifications)
  if (exportRecord.fichierComplement?.s3Key) {
    const buffer = await downloadFile(exportRecord.fichierComplement.s3Key);
    piecesJointes.push({
      content: buffer.toString('base64'),
      name: exportRecord.fichierComplement.fileName || `SAR_Listingstructure${exportRecord.annee}_export_complement.xlsx`
    });
    detailsFichiers += `
      <li><strong>Modifications :</strong> ${exportRecord.fichierComplement.nombrePaiements} modification(s) - ${(exportRecord.fichierComplement.montantTotal || 0).toFixed(2)} €</li>
    `;
  }

  // Ancien format (compatibilité)
  if (piecesJointes.length === 0 && exportRecord.s3Key) {
    const buffer = await downloadFile(exportRecord.s3Key);
    piecesJointes.push({
      content: buffer.toString('base64'),
      name: `UNAF_Export_${exportRecord.annee}_${exportRecord.dateExport.toISOString().split('T')[0]}.xlsx`
    });
    detailsFichiers = `<li>Nombre de paiements : ${exportRecord.nombrePaiements}</li>`;
  }

  if (piecesJointes.length === 0) {
    res.status(400);
    throw new Error('Aucun fichier à envoyer pour cet export');
  }

  // Préparer le contenu de l'email
  const sujet = `Export UNAF du ${dateExport}`;
  const contenuHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #1f2937;">Export UNAF - SAR</h2>
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-joint ${piecesJointes.length > 1 ? 'les fichiers d\'export' : 'le fichier d\'export'} des adhésions UNAF du <strong>${dateExport}</strong>.</p>
      <p><strong>Détails de l'export :</strong></p>
      <ul>
        ${detailsFichiers}
        <li><strong>Total général :</strong> ${exportRecord.nombrePaiements} paiement(s) - ${exportRecord.montantTotal.toFixed(2)} €</li>
        <li>Premier export de l'année : ${exportRecord.isFirstExport ? 'Oui' : 'Non'}</li>
      </ul>
      ${piecesJointes.length > 1 ? '<p><em>Note : Vous trouverez 2 fichiers en pièce jointe - un pour les nouvelles souscriptions et un pour les modifications (complément).</em></p>' : ''}
      <p>Cordialement,<br>SAR - Syndicat Apicole de la Réunion</p>
    </div>
  `;

  // Envoyer l'email avec les pièces jointes
  await envoyerEmailAvecPieceJointe(
    UNAF_EMAIL,
    sujet,
    contenuHtml,
    piecesJointes
  );

  // Mettre à jour le statut
  exportRecord.status = 'envoye';
  exportRecord.notes = `Envoyé par email le ${new Date().toLocaleDateString('fr-FR')} à ${UNAF_EMAIL} (${piecesJointes.length} fichier(s))`;
  exportRecord.dateEnvoi = new Date();
  await exportRecord.save();

  res.json({
    message: `Export envoyé avec succès à ${UNAF_EMAIL} (${piecesJointes.length} fichier(s))`,
    export: exportRecord,
  });
});

// @desc    Activer les adhésions d'un export UNAF
// @route   PUT /api/unaf-export/:id/activate
// @access  Private/Permission unafServices.activateExport
const activateExport = asyncHandler(async (req, res) => {
  // Vérification de la permission unafServices.activateExport
  const userPermissions = await Permission.findOne({ userId: req.user._id });
  const hasPermission = req.user.role === 'super_admin' || userPermissions?.unafServices?.activateExport;
  
  if (!hasPermission) {
    res.status(403);
    throw new Error('Vous n\'avez pas la permission d\'activer un export UNAF');
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
      const service = await Service.findById(serviceId).populate('user', 'typePersonne type prenom nom email telephone telephoneMobile adresse dateNaissance designation raisonSociale migrationUNAF2025');
      
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

  // Valider et appliquer les modifications
  for (const modif of exportRecord.modificationsIncluses) {
    try {
      const service = await Service.findById(modif.serviceId).populate('user', 'typePersonne type prenom nom email telephone telephoneMobile adresse dateNaissance designation raisonSociale migrationUNAF2025');
      
      if (service && service.historiqueModifications[modif.modificationIndex]) {
        const historiqueEntry = service.historiqueModifications[modif.modificationIndex];
        
        // Vérifier que la modification est payée et pas encore validée
        if (historiqueEntry.paiement?.status === 'paye' && !historiqueEntry.validated) {
          const mods = historiqueEntry.modifications;
          const nombreRuches = service.unafData?.nombreRuches || 0;
          
          // Tarifs pour recalcul
          const TARIFS = {
            affairesJuridiques: 0.15,
            ecocontribution: 0.12,
            assurance: { formule1: 0.10, formule2: 1.65, formule3: 2.80 },
          };
          
          // Appliquer les modifications au service
          if (mods.formuleApres && mods.formuleApres !== mods.formuleAvant) {
            service.unafData.options.assurance.formule = mods.formuleApres;
            service.unafData.options.assurance.prixParRuche = TARIFS.assurance[mods.formuleApres];
            service.unafData.options.assurance.montant = TARIFS.assurance[mods.formuleApres] * nombreRuches;
            service.unafData.detailMontants.assurance = TARIFS.assurance[mods.formuleApres] * nombreRuches;
          }
          if (mods.revueApres && mods.revueApres !== mods.revueAvant) {
            service.unafData.options.revue.choix = mods.revueApres;
            service.unafData.options.revue.montant = TARIFS.revue[mods.revueApres] || 0;
            service.unafData.detailMontants.revue = TARIFS.revue[mods.revueApres] || 0;
          }
          if (mods.affairesJuridiquesApres !== undefined && mods.affairesJuridiquesApres !== mods.affairesJuridiquesAvant) {
            service.unafData.options.affairesJuridiques.souscrit = mods.affairesJuridiquesApres;
            service.unafData.options.affairesJuridiques.montant = mods.affairesJuridiquesApres ? TARIFS.affairesJuridiques * nombreRuches : 0;
            service.unafData.detailMontants.affairesJuridiques = mods.affairesJuridiquesApres ? TARIFS.affairesJuridiques * nombreRuches : 0;
          }
          if (mods.ecocontributionApres !== undefined && mods.ecocontributionApres !== mods.ecocontributionAvant) {
            service.unafData.options.ecocontribution.souscrit = mods.ecocontributionApres;
            service.unafData.options.ecocontribution.montant = mods.ecocontributionApres ? TARIFS.ecocontribution * nombreRuches : 0;
            service.unafData.detailMontants.ecocontribution = mods.ecocontributionApres ? TARIFS.ecocontribution * nombreRuches : 0;
          }
          
          // Recalculer le total
          const dm = service.unafData.detailMontants;
          const newTotal = (dm.cotisationUNAF || 0) + (dm.affairesJuridiques || 0) + 
                          (dm.ecocontribution || 0) + (dm.revue || 0) + (dm.assurance || 0);
          service.unafData.detailMontants.total = Math.round(newTotal * 100) / 100;
          
          // Marquer la modification comme validée
          historiqueEntry.validated = true;
          historiqueEntry.dateValidation = new Date();
          
          // Régénérer l'attestation avec les nouvelles valeurs
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
            console.error(`Erreur régénération attestation après modification ${modif.serviceId}:`, attestationError);
          }
          
          await service.save();
          activatedCount++;
          console.log(`✅ Modification ${modif.modificationIndex} du service ${modif.serviceId} validée et appliquée`);
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
