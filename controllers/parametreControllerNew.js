const asyncHandler = require('express-async-handler');
const Parametre = require('../models/parametreModel');
const Adhesion = require('../models/adhesionModel');

// @desc    Obtenir tous les paramètres (tous organismes, toutes années)
// @route   GET /api/parametres
// @access  Private/Admin
const getAllParametres = asyncHandler(async (req, res) => {
  const parametres = await Parametre.find({})
    .sort({ annee: -1, organisme: 1 });
  res.json(parametres);
});

// @desc    Obtenir les paramètres d'un organisme pour une année
// @route   GET /api/parametres/:organisme/:annee
// @access  Public
const getParametreByOrganismeAnnee = asyncHandler(async (req, res) => {
  const { organisme, annee } = req.params;

  const parametre = await Parametre.findOne({ 
    organisme: organisme.toUpperCase(), 
    annee: parseInt(annee) 
  });

  if (!parametre) {
    res.status(404);
    throw new Error(`Aucun paramètre trouvé pour ${organisme} ${annee}`);
  }

  res.json(parametre);
});

// @desc    Obtenir les paramètres de l'année en cours pour tous les organismes
// @route   GET /api/parametres/current
// @access  Public
const getCurrentYearParametres = asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();
  
  const parametres = await Parametre.find({ 
    annee: currentYear 
  });

  res.json(parametres);
});

// @desc    Obtenir les années disponibles pour les adhésions
// @route   GET /api/parametres/annees-disponibles
// @access  Public
const getAnneesDisponibles = asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  // Récupérer les paramètres pour l'année en cours et l'année prochaine
  const parametresCurrentYear = await Parametre.find({ annee: currentYear });
  const parametresNextYear = await Parametre.find({ 
    annee: nextYear,
    adhesionsOuvertes: true 
  });

  const anneesDisponibles = [];
  
  // L'année en cours est toujours disponible
  if (parametresCurrentYear.length > 0) {
    anneesDisponibles.push({
      annee: currentYear,
      estAnneeEnCours: true,
      organismes: parametresCurrentYear.map(p => ({
        organisme: p.organisme,
        tarifs: p.tarifs,
        adhesionsOuvertes: true // Toujours ouvertes pour l'année en cours
      }))
    });
  }

  // L'année prochaine si les adhésions sont ouvertes
  if (parametresNextYear.length > 0) {
    anneesDisponibles.push({
      annee: nextYear,
      estAnneeEnCours: false,
      organismes: parametresNextYear.map(p => ({
        organisme: p.organisme,
        tarifs: p.tarifs,
        adhesionsOuvertes: p.adhesionsOuvertes
      }))
    });
  }

  res.json({
    anneesDisponibles,
    anneeActuelle: currentYear
  });
});

// @desc    Créer les paramètres pour une nouvelle année (Admin)
// @route   POST /api/parametres
// @access  Private/Admin
const createParametre = asyncHandler(async (req, res) => {
  const { organisme, annee, tarifs } = req.body;

  if (!organisme || !annee || !tarifs) {
    res.status(400);
    throw new Error('Organisme, année et tarifs sont requis');
  }

  // Vérifier si les paramètres existent déjà
  const existingParametre = await Parametre.findOne({ organisme, annee });

  if (existingParametre) {
    res.status(400);
    throw new Error(`Les paramètres pour ${organisme} ${annee} existent déjà`);
  }

  const currentYear = new Date().getFullYear();
  const estAnneeEnCours = annee === currentYear;

  const parametre = await Parametre.create({
    organisme,
    annee,
    tarifs,
    adhesionsOuvertes: estAnneeEnCours, // Ouvertes si année en cours, fermées sinon
    estAnneeEnCours
  });

  res.status(201).json(parametre);
});

// @desc    Mettre à jour les tarifs (uniquement pour année N+1)
// @route   PUT /api/parametres/:organisme/:annee/tarifs
// @access  Private/Admin
const updateTarifs = asyncHandler(async (req, res) => {
  const { organisme, annee } = req.params;
  const { tarifs } = req.body;

  const parametre = await Parametre.findOne({ 
    organisme: organisme.toUpperCase(), 
    annee: parseInt(annee) 
  });

  if (!parametre) {
    res.status(404);
    throw new Error('Paramètres non trouvés');
  }

  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  // Vérifier qu'on ne modifie que l'année N+1
  if (parseInt(annee) !== nextYear) {
    res.status(403);
    throw new Error('Modification des tarifs autorisée uniquement pour l\'année N+1');
  }

  // Vérifier que l'année en cours est bien fermée (pas de modification possible)
  if (parseInt(annee) === currentYear) {
    res.status(403);
    throw new Error('Impossible de modifier les tarifs de l\'année en cours');
  }

  parametre.tarifs = tarifs;
  await parametre.save();

  res.json(parametre);
});

// @desc    Toggle adhésions ouvertes/fermées (uniquement pour année N+1)
// @route   PUT /api/parametres/:organisme/:annee/toggle-adhesions
// @access  Private/Admin
const toggleAdhesions = asyncHandler(async (req, res) => {
  const { organisme, annee } = req.params;

  const parametre = await Parametre.findOne({ 
    organisme: organisme.toUpperCase(), 
    annee: parseInt(annee) 
  });

  if (!parametre) {
    res.status(404);
    throw new Error('Paramètres non trouvés');
  }

  const currentYear = new Date().getFullYear();

  // Impossible de fermer les adhésions de l'année en cours
  if (parseInt(annee) === currentYear) {
    res.status(403);
    throw new Error('Impossible de fermer les adhésions de l\'année en cours');
  }

  // Toggle
  parametre.adhesionsOuvertes = !parametre.adhesionsOuvertes;
  await parametre.save();

  res.json({
    organisme: parametre.organisme,
    annee: parametre.annee,
    adhesionsOuvertes: parametre.adhesionsOuvertes,
    message: `Adhésions ${parametre.adhesionsOuvertes ? 'ouvertes' : 'fermées'} pour ${organisme} ${annee}`
  });
});

// @desc    Obtenir les statistiques d'adhésions par année et organisme
// @route   GET /api/parametres/statistiques
// @access  Private/Admin
const getStatistiques = asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();

  const stats = await Adhesion.aggregate([
    {
      $group: {
        _id: {
          annee: '$annee',
          organisme: '$organisme',
          status: '$status'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: {
          annee: '$_id.annee',
          organisme: '$_id.organisme'
        },
        total: { $sum: '$count' },
        parStatus: {
          $push: {
            status: '$_id.status',
            count: '$count'
          }
        }
      }
    },
    {
      $sort: { '_id.annee': -1, '_id.organisme': 1 }
    }
  ]);

  res.json({
    anneeActuelle: currentYear,
    statistiques: stats
  });
});

// @desc    Initialiser les paramètres pour la nouvelle année (Cron Job)
// @route   POST /api/parametres/init-nouvelle-annee
// @access  Private/Admin
const initNouvelleAnnee = asyncHandler(async (req, res) => {
  const nextYear = new Date().getFullYear() + 1;

  // Vérifier si les paramètres existent déjà pour l'année prochaine
  const existingSAR = await Parametre.findOne({ organisme: 'SAR', annee: nextYear });
  const existingAMAIR = await Parametre.findOne({ organisme: 'AMAIR', annee: nextYear });

  const created = [];

  // Récupérer les tarifs de l'année en cours pour initialiser
  const currentYear = new Date().getFullYear();
  const currentSAR = await Parametre.findOne({ organisme: 'SAR', annee: currentYear });
  const currentAMAIR = await Parametre.findOne({ organisme: 'AMAIR', annee: currentYear });

  if (!existingSAR) {
    const sarParametre = await Parametre.create({
      organisme: 'SAR',
      annee: nextYear,
      tarifs: currentSAR ? currentSAR.tarifs : { loisir: 30, professionnel: 50 },
      adhesionsOuvertes: false, // Fermées par défaut
      estAnneeEnCours: false
    });
    created.push(sarParametre);
  }

  if (!existingAMAIR) {
    const amairParametre = await Parametre.create({
      organisme: 'AMAIR',
      annee: nextYear,
      tarifs: currentAMAIR ? currentAMAIR.tarifs : { loisir: 25, professionnel: 45 },
      adhesionsOuvertes: false, // Fermées par défaut
      estAnneeEnCours: false
    });
    created.push(amairParametre);
  }

  if (created.length === 0) {
    res.status(400);
    throw new Error(`Les paramètres pour l'année ${nextYear} existent déjà`);
  }

  res.status(201).json({
    message: `Paramètres créés pour l'année ${nextYear}`,
    parametres: created
  });
});

// @desc    Mettre à jour le flag estAnneeEnCours (Cron Job au 1er janvier)
// @route   POST /api/parametres/update-annee-en-cours
// @access  Private/Admin
const updateAnneeEnCours = asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();

  // Mettre à jour tous les paramètres
  await Parametre.updateMany(
    { annee: currentYear },
    { estAnneeEnCours: true, adhesionsOuvertes: true }
  );

  await Parametre.updateMany(
    { annee: { $ne: currentYear } },
    { estAnneeEnCours: false }
  );

  res.json({
    message: `Année en cours mise à jour: ${currentYear}`,
    anneeEnCours: currentYear
  });
});

module.exports = {
  getAllParametres,
  getParametreByOrganismeAnnee,
  getCurrentYearParametres,
  getAnneesDisponibles,
  createParametre,
  updateTarifs,
  toggleAdhesions,
  getStatistiques,
  initNouvelleAnnee,
  updateAnneeEnCours
};
