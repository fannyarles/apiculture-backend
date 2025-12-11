const asyncHandler = require('express-async-handler');
const Adhesion = require('../models/adhesionModel');
const Parametre = require('../models/parametreModel');
const User = require('../models/userModel');
const nodemailer = require('nodemailer');
const { generateAndUploadAdhesionPDF } = require('../services/pdfService');

// Configuration du transporteur SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

// @desc    Créer une nouvelle adhésion
// @route   POST /api/adhesions
// @access  Private
const createAdhesion = asyncHandler(async (req, res) => {
  const {
    organisme,
    annee,
    informationsApicoles,
    informationsPersonnelles,
    informationsSpecifiques,
    paiement,
    signature,
  } = req.body;

  // Extraire les informations apicoles
  const nombreRuches = informationsApicoles?.nombreRuches;
  const nombreRuchers = informationsApicoles?.nombreRuchers;
  const napi = informationsApicoles?.napi;
  const numeroAmexa = informationsApicoles?.numeroAmexa;
  const siret = informationsApicoles?.siret;
  const localisation = informationsApicoles?.localisation;

  // Vérifier si l'utilisateur a déjà une adhésion pour cette année et cet organisme
  const existingAdhesion = await Adhesion.findOne({
    user: req.user._id,
    organisme,
    annee,
  });

  if (existingAdhesion) {
    res.status(400);
    throw new Error('Vous avez déjà une adhésion pour cet organisme cette année');
  }

  // Récupérer les paramètres pour l'organisme et l'année
  const parametre = await Parametre.findOne({ organisme, annee });

  if (!parametre) {
    res.status(400);
    throw new Error(`Paramètres non trouvés pour ${organisme} ${annee}`);
  }

  // Vérifier que les adhésions sont ouvertes
  if (!parametre.adhesionsOuvertes) {
    res.status(400);
    throw new Error(`Les adhésions pour ${organisme} ${annee} sont fermées`);
  }

  // Calculer le montant selon l'organisme
  let montant = 0;
  
  if (organisme === 'SAR') {
    // Vérifier si l'utilisateur a une adhésion active de l'année N-1
    const adhesionN1 = await Adhesion.findOne({
      user: req.user._id,
      organisme: 'SAR',
      annee: annee - 1,
      status: 'actif'
    });
    
    const cotisationBase = parametre.tarifs.SAR.base;
    const droitEntree = adhesionN1 ? 0 : parametre.tarifs.SAR.droitEntree;
    const cotisationRuches = (nombreRuches || 0) * parametre.tarifs.SAR.cotisationParRuche;
    
    montant = cotisationBase + droitEntree + cotisationRuches;
  } else if (organisme === 'AMAIR') {
    montant = parametre.tarifs.AMAIR.base;
  }

  // Créer l'adhésion avec toutes les informations
  const adhesion = await Adhesion.create({
    user: req.user._id,
    organisme,
    annee,
    napi,
    numeroAmexa,
    nombreRuches,
    nombreRuchers,
    siret,
    localisation: {
      departement: localisation?.departement,
      commune: localisation?.commune,
    },
    informationsPersonnelles: {
      nom: informationsPersonnelles?.nom,
      prenom: informationsPersonnelles?.prenom,
      dateNaissance: informationsPersonnelles?.dateNaissance,
      adresse: {
        rue: informationsPersonnelles?.adresse?.rue,
        codePostal: informationsPersonnelles?.adresse?.codePostal,
        ville: informationsPersonnelles?.adresse?.ville,
      },
      telephone: informationsPersonnelles?.telephone,
      email: informationsPersonnelles?.email,
    },
    informationsSpecifiques: informationsSpecifiques || {},
    signature,
    paiement: {
      montant,
      typePaiement: paiement?.typePaiement,
      status: 'non_demande',
    },
    status: 'en_attente',
  });

  const populatedAdhesion = await Adhesion.findById(adhesion._id).populate(
    'user',
    'prenom nom email'
  );

  res.status(201).json(populatedAdhesion);
});

// @desc    Obtenir toutes les adhésions de l'utilisateur connecté
// @route   GET /api/adhesions/my-adhesions
// @access  Private
const getMyAdhesions = asyncHandler(async (req, res) => {
  const adhesions = await Adhesion.find({ user: req.user._id })
    .populate('user', 'prenom nom email')
    .sort({ createdAt: -1 });

  res.json(adhesions);
});

// @desc    Obtenir une adhésion par ID
// @route   GET /api/adhesions/:id
// @access  Private
const getAdhesionById = asyncHandler(async (req, res) => {
  const adhesion = await Adhesion.findById(req.params.id).populate(
    'user',
    'prenom nom email telephone adresse dateNaissance'
  );

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Vérifier que l'utilisateur est propriétaire ou admin
  if (
    adhesion.user._id.toString() !== req.user._id.toString() &&
    !['admin', 'super_admin'].includes(req.user.role)
  ) {
    res.status(403);
    throw new Error('Non autorisé à voir cette adhésion');
  }

  res.json(adhesion);
});

// @desc    Obtenir toutes les adhésions (Admin)
// @route   GET /api/adhesions
// @access  Private/Admin
const getAllAdhesions = asyncHandler(async (req, res) => {
  const { annee, organisme, status } = req.query;
  const { getOrganismeFilter } = require('../utils/organismeHelper');

  let filter = {};
  
  // Filtrer automatiquement par les organismes de l'admin
  // Super admin voit tout, admin voit ses organismes
  if (!organisme) {
    // Pas de filtre organisme spécifique : utiliser les organismes de l'admin
    const organismeFilter = getOrganismeFilter(req.user);
    filter = { ...filter, ...organismeFilter };
  } else {
    // Filtre organisme spécifique demandé
    filter.organisme = organisme;
  }
  
  if (annee) filter.annee = parseInt(annee);
  if (status) filter.status = status;

  const adhesions = await Adhesion.find(filter)
    .populate('user', 'prenom nom email phone')
    .sort({ createdAt: -1 });

  res.json(adhesions);
});

// @desc    Mettre à jour le statut d'une adhésion (Admin)
// @route   PUT /api/adhesions/:id/status
// @access  Private/Admin
const updateAdhesionStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const adhesion = await Adhesion.findById(req.params.id).populate(
    'user',
    'prenom nom email'
  );

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  adhesion.status = status || adhesion.status;
  adhesion.notes = notes !== undefined ? notes : adhesion.notes;

  if (status === 'paiement_demande') {
    adhesion.dateValidation = new Date();
  }

  const updatedAdhesion = await adhesion.save();

  res.json(updatedAdhesion);
});

// @desc    Demander le paiement (Admin)
// @route   POST /api/adhesions/:id/request-payment
// @access  Private/Admin
const requestPayment = asyncHandler(async (req, res) => {
  const adhesion = await Adhesion.findById(req.params.id).populate(
    'user',
    'prenom nom email'
  );

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Mettre à jour le statut
  adhesion.paiement.status = 'demande';
  adhesion.status = 'paiement_demande';
  adhesion.dateValidation = new Date();
  await adhesion.save();

  // Envoyer l'email avec le lien de paiement
  const paymentLink = `${process.env.FRONTEND_URL}/reglement-adhesion/${adhesion._id}`;

  try {
    await transporter.sendMail({
      from: `"${process.env.PLATFORM_NAME}" ${process.env.SMTP_FROM_EMAIL}`,
      to: adhesion.user.email,
      subject: `Demande de paiement - Adhésion ${adhesion.organisme} ${adhesion.annee}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Bonjour ${adhesion.user.prenom} ${adhesion.user.nom},</h2>
          
          <p>Votre demande d'adhésion à <strong>${adhesion.organisme === 'SAR' ? 'Syndicat Apicole de la Réunion' : 'Association de la Maison de l\'Apiculture de la Réunion'}</strong> pour l'année ${adhesion.annee} a été validée.</p>
          
          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Montant à régler :</strong> ${adhesion.paiement.montant.toFixed(2)} €</p>
          </div>
          
          <p>Pour finaliser votre adhésion, veuillez effectuer le paiement en cliquant sur le bouton ci-dessous :</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${paymentLink}" 
               style="background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Régler mon adhésion
            </a>
          </div>
          
          <p style="color: #6B7280; font-size: 14px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
          <p style="color: #6B7280; font-size: 14px; word-break: break-all;">${paymentLink}</p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
          
          <p style="color: #6B7280; font-size: 12px;">
            Cordialement,<br>
            L'équipe ${adhesion.organisme}
          </p>
        </div>
      `,
    });

    res.json({ 
      message: 'Email de demande de paiement envoyé avec succès',
      adhesion: adhesion
    });
  } catch (error) {
    console.error('Erreur envoi email:', error);
    res.status(500);
    throw new Error("Erreur lors de l'envoi de l'email");
  }
});

// @desc    Supprimer une adhésion (Admin)
// @route   DELETE /api/adhesions/:id
// @access  Private/Admin
const deleteAdhesion = asyncHandler(async (req, res) => {
  const adhesion = await Adhesion.findById(req.params.id);

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  await adhesion.deleteOne();
  res.json({ message: 'Adhésion supprimée' });
});

// @desc    Obtenir les statistiques (Admin)
// @route   GET /api/adhesions/stats/summary
// @access  Private/Admin
const getStats = asyncHandler(async (req, res) => {
  const { annee } = req.query;
  const filter = annee ? { annee: parseInt(annee) } : {};

  const total = await Adhesion.countDocuments(filter);
  const enAttente = await Adhesion.countDocuments({ ...filter, status: 'en_attente' });
  const validees = await Adhesion.countDocuments({ ...filter, status: 'paiement_demande' });
  const actives = await Adhesion.countDocuments({ ...filter, status: 'actif' });
  const refusees = await Adhesion.countDocuments({ ...filter, status: 'refuse' });

  const sar = await Adhesion.countDocuments({ ...filter, organisme: 'SAR' });
  const amair = await Adhesion.countDocuments({ ...filter, organisme: 'AMAIR' });

  res.json({
    total,
    parStatut: {
      enAttente,
      validees,
      actives,
      refusees,
    },
    parOrganisme: {
      sar,
      amair,
    },
  });
});

// @desc    Envoyer une demande d'aide pour une adhésion
// @route   POST /api/adhesions/:id/demande-aide
// @access  Private
const sendHelpRequest = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const adhesionId = req.params.id;

  if (!message) {
    res.status(400);
    throw new Error('Veuillez fournir un message');
  }

  const adhesion = await Adhesion.findById(adhesionId).populate('user', 'prenom nom email');

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Vérifier que l'utilisateur est propriétaire
  if (adhesion.user._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Récupérer les emails des admins
  const admins = await User.find({ role: 'admin' }).select('email');
  const adminEmails = admins.map(admin => admin.email);

  if (adminEmails.length === 0) {
    res.status(500);
    throw new Error('Aucun administrateur trouvé');
  }
console.log(adhesion)
  // Envoyer l'email aux admins
  try {
    await transporter.sendMail({
      from: `"${process.env.PLATFORM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: adminEmails.join(', '),
      subject: `Demande d'aide - Adhésion ${adhesion.organisme} ${adhesion.annee}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #EF4444;">Demande d'aide</h2>
          
          <p>Un adhérent a besoin d'aide concernant son adhésion.</p>
          
          <div style="background-color: #FEF2F2; padding: 20px; border-left: 4px solid #EF4444; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Adhérent :</strong> ${adhesion.user.prenom} ${adhesion.user.nom}</p>
            <p style="margin: 5px 0;"><strong>Email :</strong> ${adhesion.user.email}</p>
            <p style="margin: 5px 0;"><strong>Organisme :</strong> ${adhesion.organisme}</p>
            <p style="margin: 5px 0;"><strong>Année :</strong> ${adhesion.annee}</p>
            <p style="margin: 5px 0;"><strong>Statut :</strong> ${adhesion.status}</p>
          </div>
          
          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Message :</strong></p>
            <p style="margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
          
          <p style="color: #6B7280; font-size: 12px;">
            Veuillez contacter l'adhérent pour lui apporter votre aide.
          </p>
        </div>
      `,
    });

    res.json({ 
      success: true,
      message: 'Demande d\'aide envoyée avec succès' 
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    res.status(500);
    throw new Error('Erreur lors de l\'envoi de la demande d\'aide');
  }
});

// @desc    Générer le PDF d'adhésion avec signature
// @route   POST /api/adhesions/:id/generate-pdf
// @access  Private
const generateAdhesionPDFController = asyncHandler(async (req, res) => {
  const { signatureBase64 } = req.body;

  if (!signatureBase64) {
    res.status(400);
    throw new Error('La signature est requise');
  }

  // Récupérer l'adhésion avec toutes les informations
  const adhesion = await Adhesion.findById(req.params.id)
    .populate('user')
    .populate('ruches');

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Vérifier que l'utilisateur est propriétaire ou admin
  if (adhesion.user._id.toString() !== req.user._id.toString() && !['admin', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  try {
    // Générer et uploader le PDF
    const result = await generateAndUploadAdhesionPDF(adhesion, signatureBase64);

    // Mettre à jour l'adhésion avec la clé S3 du PDF
    adhesion.pdfKey = result.key;
    adhesion.pdfUrl = result.url;
    await adhesion.save();

    res.json({
      success: true,
      message: 'PDF généré avec succès',
      pdfKey: result.key,
      pdfUrl: result.url
    });
  } catch (error) {
    console.error('Erreur génération PDF:', error);
    res.status(500);
    throw new Error('Erreur lors de la génération du PDF');
  }
});

module.exports = {
  createAdhesion,
  getMyAdhesions,
  getAdhesionById,
  getAllAdhesions,
  updateAdhesionStatus,
  requestPayment,
  deleteAdhesion,
  getStats,
  generateAdhesionPDFController,
  sendHelpRequest,
};
