const asyncHandler = require('express-async-handler');
const Parametre = require('../models/parametreModel');

// @desc    Obtenir tous les paramètres
// @route   GET /api/parametres
// @access  Public
const getParametres = asyncHandler(async (req, res) => {
  const parametres = await Parametre.find({}).sort({ annee: -1 });
  res.json(parametres);
});

// @desc    Obtenir les paramètres actifs
// @route   GET /api/parametres/active
// @access  Public
const getActiveParametres = asyncHandler(async (req, res) => {
  const parametres = await Parametre.find({ isActive: true }).sort({ annee: -1 });
  res.json(parametres);
});

// @desc    Obtenir les paramètres d'une année spécifique
// @route   GET /api/parametres/:annee
// @access  Public
const getParametreByAnnee = asyncHandler(async (req, res) => {
  const parametre = await Parametre.findOne({ annee: req.params.annee });

  if (!parametre) {
    res.status(404);
    throw new Error('Aucun paramètre trouvé pour cette année');
  }

  res.json(parametre);
});

// @desc    Créer de nouveaux paramètres (Admin)
// @route   POST /api/parametres
// @access  Private/Admin
const createParametre = asyncHandler(async (req, res) => {
  const {
    annee,
    tarifsSAR,
    tarifsAMAIR,
    dateDebutAdhesions,
    dateFinAdhesions,
    isActive,
  } = req.body;

  // Vérifier si les paramètres existent déjà pour cette année
  const existingParametre = await Parametre.findOne({ annee });

  if (existingParametre) {
    res.status(400);
    throw new Error('Les paramètres existent déjà pour cette année');
  }

  // Si isActive est true, désactiver les autres paramètres
  if (isActive) {
    await Parametre.updateMany({}, { isActive: false });
  }

  const parametre = await Parametre.create({
    annee,
    tarifsSAR,
    tarifsAMAIR,
    dateDebutAdhesions,
    dateFinAdhesions,
    isActive: isActive !== undefined ? isActive : true,
  });

  res.status(201).json(parametre);
});

// @desc    Mettre à jour les paramètres (Admin)
// @route   PUT /api/parametres/:id
// @access  Private/Admin
const updateParametre = asyncHandler(async (req, res) => {
  const parametre = await Parametre.findById(req.params.id);

  if (!parametre) {
    res.status(404);
    throw new Error('Paramètre non trouvé');
  }

  const {
    tarifsSAR,
    tarifsAMAIR,
    dateDebutAdhesions,
    dateFinAdhesions,
    isActive,
  } = req.body;

  // Si on active ce paramètre, désactiver les autres
  if (isActive && !parametre.isActive) {
    await Parametre.updateMany({ _id: { $ne: parametre._id } }, { isActive: false });
  }

  parametre.tarifsSAR = tarifsSAR || parametre.tarifsSAR;
  parametre.tarifsAMAIR = tarifsAMAIR || parametre.tarifsAMAIR;
  parametre.dateDebutAdhesions = dateDebutAdhesions || parametre.dateDebutAdhesions;
  parametre.dateFinAdhesions = dateFinAdhesions || parametre.dateFinAdhesions;
  parametre.isActive = isActive !== undefined ? isActive : parametre.isActive;

  const updatedParametre = await parametre.save();

  res.json(updatedParametre);
});

// @desc    Supprimer les paramètres (Admin)
// @route   DELETE /api/parametres/:id
// @access  Private/Admin
const deleteParametre = asyncHandler(async (req, res) => {
  const parametre = await Parametre.findById(req.params.id);

  if (!parametre) {
    res.status(404);
    throw new Error('Paramètre non trouvé');
  }

  await parametre.deleteOne();
  res.json({ message: 'Paramètre supprimé' });
});

// @desc    Activer/Désactiver les paramètres d'une année (Admin)
// @route   PUT /api/parametres/:id/toggle-active
// @access  Private/Admin
const toggleActiveParametre = asyncHandler(async (req, res) => {
  const parametre = await Parametre.findById(req.params.id);

  if (!parametre) {
    res.status(404);
    throw new Error('Paramètre non trouvé');
  }

  // Si on active ce paramètre, désactiver tous les autres
  if (!parametre.isActive) {
    await Parametre.updateMany({ _id: { $ne: parametre._id } }, { isActive: false });
    parametre.isActive = true;
  } else {
    parametre.isActive = false;
  }

  const updatedParametre = await parametre.save();

  res.json(updatedParametre);
});

module.exports = {
  getParametres,
  getActiveParametres,
  getParametreByAnnee,
  createParametre,
  updateParametre,
  deleteParametre,
  toggleActiveParametre,
};
