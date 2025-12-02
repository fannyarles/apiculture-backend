const asyncHandler = require('express-async-handler');
const Adhesion = require('../models/adhesionModel');
const Parametre = require('../models/parametreModel');
const nodemailer = require('nodemailer');

// Configuration du transporteur SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// @desc    Créer une nouvelle adhésion
// @route   POST /api/adhesions
// @access  Private
const createAdhesion = asyncHandler(async (req, res) => {
  const {
    organisme,
    annee,
    napi,
    nombreRuches,
    typeApiculture,
    assurance,
  } = req.body;

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

  // Récupérer les paramètres de l'année
  const parametre = await Parametre.findOne({ annee, isActive: true });

  if (!parametre) {
    res.status(400);
    throw new Error('Aucun paramètre actif trouvé pour cette année');
  }

  // Calculer le montant
  let montant;
  if (organisme === 'SAR') {
    montant = typeApiculture === 'loisir' 
      ? parametre.tarifsSAR.loisir 
      : parametre.tarifsSAR.professionnel;
  } else {
    montant = typeApiculture === 'loisir' 
      ? parametre.tarifsAMAIR.loisir 
      : parametre.tarifsAMAIR.professionnel;
  }

  // Créer l'adhésion
  const adhesion = await Adhesion.create({
    user: req.user._id,
    organisme,
    annee,
    napi,
    nombreRuches,
    typeApiculture,
    assurance,
    paiement: {
      montant,
      status: 'en_attente',
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
// @route   GET /api/adhesions/my
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
    'prenom nom email phone address'
  );

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Vérifier que l'utilisateur est propriétaire ou admin
  if (
    adhesion.user._id.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
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

  let filter = {};
  
  if (annee) filter.annee = parseInt(annee);
  if (organisme) filter.organisme = organisme;
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

  if (status === 'validee') {
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
  adhesion.paiement.status = 'attente_paiement';
  adhesion.status = 'validee';
  adhesion.dateValidation = new Date();
  await adhesion.save();

  // Envoyer l'email avec le lien de paiement
  const paymentLink = `${process.env.FRONTEND_URL}/reglement-adhesion/${adhesion._id}`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: adhesion.user.email,
      subject: `Demande de paiement - Adhésion ${adhesion.organisme} ${adhesion.annee}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Bonjour ${adhesion.user.prenom} ${adhesion.user.nom},</h2>
          
          <p>Votre demande d'adhésion à <strong>${adhesion.organisme === 'SAR' ? 'Syndicat des Apiculteurs Réunis' : 'Association des Miels et Apiculteurs Indépendants Réunis'}</strong> pour l'année ${adhesion.annee} a été validée.</p>
          
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
  const validees = await Adhesion.countDocuments({ ...filter, status: 'validee' });
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

module.exports = {
  createAdhesion,
  getMyAdhesions,
  getAdhesionById,
  getAllAdhesions,
  updateAdhesionStatus,
  requestPayment,
  deleteAdhesion,
  getStats,
};
