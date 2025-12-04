const asyncHandler = require('express-async-handler');
const Communication = require('../models/communicationModel');
const User = require('../models/userModel');
const Adhesion = require('../models/adhesionModel');
const Preference = require('../models/preferenceModel');
const { envoyerCommunication } = require('../services/emailService');

// @desc    Obtenir les destinataires d'une communication
const getDestinataires = async (communication) => {
  const currentYear = new Date().getFullYear();

  // Récupérer tous les adhérents actifs de l'année en cours
  const adhesionsActives = await Adhesion.find({
    annee: currentYear,
    status: 'actif'
  }).populate('user');

  const adherentsActifs = adhesionsActives.map(adh => adh.user).filter(user => user);

  let destinataires = [];

  if (communication.estSanitaire) {
    // Alerte sanitaire : tous les adhérents qui acceptent les alertes sanitaires
    for (const user of adherentsActifs) {
      const prefs = await Preference.findOne({ user: user._id });
      if (prefs?.communications?.alertesSanitaires) {
        destinataires.push(user);
      }
    }
  } else if (communication.destinataires === 'mon_groupement') {
    // Communication pour le groupement de l'auteur uniquement
    for (const user of adherentsActifs) {
      if (user.organisme === communication.organisme) {
        const prefs = await Preference.findOne({ user: user._id });
        if (prefs?.communications?.mesGroupements) {
          destinataires.push(user);
        }
      }
    }
  } else if (communication.destinataires === 'tous_groupements') {
    // Communication pour tous les groupements
    for (const user of adherentsActifs) {
      const prefs = await Preference.findOne({ user: user._id });
      
      if (user.organisme === communication.organisme) {
        // Adhérents du même groupement
        if (prefs?.communications?.mesGroupements) {
          destinataires.push(user);
        }
      } else {
        // Adhérents des autres groupements
        if (prefs?.communications?.autresGroupements) {
          destinataires.push(user);
        }
      }
    }
  }

  return destinataires;
};

// @desc    Créer une communication
// @route   POST /api/communications
// @access  Private/Admin
const createCommunication = asyncHandler(async (req, res) => {
  const {
    titre,
    contenu,
    estSanitaire,
    destinataires,
    statut,
    dateProgrammee
  } = req.body;

  // Validation
  if (!titre || !contenu) {
    res.status(400);
    throw new Error('Le titre et le contenu sont requis');
  }

  if (statut === 'programme' && !dateProgrammee) {
    res.status(400);
    throw new Error('La date programmée est requise pour un envoi programmé');
  }

  const communication = await Communication.create({
    titre,
    contenu,
    auteur: req.user._id,
    organisme: req.user.organisme,
    estSanitaire: estSanitaire || false,
    destinataires: destinataires || 'mon_groupement',
    statut: statut || 'brouillon',
    dateProgrammee: statut === 'programme' ? dateProgrammee : undefined
  });

  const populatedCommunication = await Communication.findById(communication._id)
    .populate('auteur', 'prenom nom email');

  res.status(201).json(populatedCommunication);
});

// @desc    Obtenir toutes les communications (avec filtres)
// @route   GET /api/communications
// @access  Private/Admin
const getCommunications = asyncHandler(async (req, res) => {
  const { statut } = req.query;

  let filter = {};

  // Filtrage par statut
  if (statut) {
    filter.statut = statut;
  }

  // Filtrage selon les règles de visibilité
  // Un admin peut voir :
  // - Les messages sanitaires
  // - Les messages de son propre groupement
  // - Les messages envoyés à tous les groupements
  filter.$or = [
    { estSanitaire: true },
    { organisme: req.user.organisme },
    { destinataires: 'tous_groupements' }
  ];

  const communications = await Communication.find(filter)
    .populate('auteur', 'prenom nom email')
    .sort({ createdAt: -1 });

  res.json(communications);
});

// @desc    Obtenir une communication par ID
// @route   GET /api/communications/:id
// @access  Private/Admin
const getCommunicationById = asyncHandler(async (req, res) => {
  const communication = await Communication.findById(req.params.id)
    .populate('auteur', 'prenom nom email');

  if (!communication) {
    res.status(404);
    throw new Error('Communication non trouvée');
  }

  // Vérifier les droits de visibilité
  const canView = 
    communication.estSanitaire ||
    communication.organisme === req.user.organisme ||
    communication.destinataires === 'tous_groupements';

  if (!canView) {
    res.status(403);
    throw new Error('Accès non autorisé à cette communication');
  }

  res.json(communication);
});

// @desc    Mettre à jour une communication (brouillons uniquement)
// @route   PUT /api/communications/:id
// @access  Private/Admin
const updateCommunication = asyncHandler(async (req, res) => {
  const communication = await Communication.findById(req.params.id);

  if (!communication) {
    res.status(404);
    throw new Error('Communication non trouvée');
  }

  // Seuls les brouillons peuvent être modifiés
  if (communication.statut !== 'brouillon') {
    res.status(400);
    throw new Error('Seuls les brouillons peuvent être modifiés');
  }

  // Seul l'auteur peut modifier
  if (communication.auteur.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé à modifier cette communication');
  }

  const {
    titre,
    contenu,
    estSanitaire,
    destinataires,
    statut,
    dateProgrammee
  } = req.body;

  communication.titre = titre || communication.titre;
  communication.contenu = contenu || communication.contenu;
  communication.estSanitaire = estSanitaire !== undefined ? estSanitaire : communication.estSanitaire;
  communication.destinataires = destinataires || communication.destinataires;
  communication.statut = statut || communication.statut;
  communication.dateProgrammee = statut === 'programme' ? dateProgrammee : undefined;

  const updatedCommunication = await communication.save();
  const populatedCommunication = await Communication.findById(updatedCommunication._id)
    .populate('auteur', 'prenom nom email');

  res.json(populatedCommunication);
});

// @desc    Supprimer une communication (brouillons uniquement)
// @route   DELETE /api/communications/:id
// @access  Private/Admin
const deleteCommunication = asyncHandler(async (req, res) => {
  const communication = await Communication.findById(req.params.id);

  if (!communication) {
    res.status(404);
    throw new Error('Communication non trouvée');
  }

  // Seuls les brouillons peuvent être supprimés
  if (communication.statut !== 'brouillon') {
    res.status(400);
    throw new Error('Seuls les brouillons peuvent être supprimés');
  }

  // Seul l'auteur peut supprimer
  if (communication.auteur.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé à supprimer cette communication');
  }

  await communication.deleteOne();
  res.json({ message: 'Communication supprimée' });
});

// @desc    Envoyer une communication maintenant
// @route   POST /api/communications/:id/send
// @access  Private/Admin
const sendCommunication = asyncHandler(async (req, res) => {
  const communication = await Communication.findById(req.params.id);

  if (!communication) {
    res.status(404);
    throw new Error('Communication non trouvée');
  }

  // Vérifier que c'est un brouillon
  if (communication.statut !== 'brouillon') {
    res.status(400);
    throw new Error('Seuls les brouillons peuvent être envoyés');
  }

  // Seul l'auteur peut envoyer
  if (communication.auteur.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé à envoyer cette communication');
  }

  // Récupérer les destinataires
  const destinataires = await getDestinataires(communication);

  if (destinataires.length === 0) {
    res.status(400);
    throw new Error('Aucun destinataire trouvé pour cette communication');
  }

  // Envoyer les emails
  const { emailsEnvoyes, emailsEchoues, erreurs } = await envoyerCommunication(
    communication,
    destinataires
  );

  // Mettre à jour la communication
  communication.statut = 'envoye';
  communication.dateEnvoi = new Date();
  communication.emailsEnvoyes = emailsEnvoyes;
  communication.emailsEchoues = emailsEchoues;
  communication.erreurs = erreurs;

  await communication.save();

  const populatedCommunication = await Communication.findById(communication._id)
    .populate('auteur', 'prenom nom email');

  res.json(populatedCommunication);
});

module.exports = {
  createCommunication,
  getCommunications,
  getCommunicationById,
  updateCommunication,
  deleteCommunication,
  sendCommunication,
  getDestinataires
};
