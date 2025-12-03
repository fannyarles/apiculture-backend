const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Parametre = require('../models/parametreModel');
const Adhesion = require('../models/adhesionModel');
const { protect, admin } = require('../middleware/authMiddleware');

// @desc    Obtenir tous les paramètres (alias pour /api/parametres)
// @route   GET /api/settings/all
// @access  Private/Admin
router.get('/all', protect, admin, asyncHandler(async (req, res) => {
  const parametres = await Parametre.find({}).sort({ annee: -1, organisme: 1 });
  res.json(parametres);
}));

// @desc    Activer/Désactiver les adhésions pour une année et un organisme
// @route   POST /api/settings/:organisme/:annee/toggle-adhesions
// @access  Private/Admin
router.post('/:organisme/:annee/toggle-adhesions', protect, admin, asyncHandler(async (req, res) => {
  const { organisme, annee } = req.params;
  const anneeInt = parseInt(annee);
  const anneeActuelle = new Date().getFullYear();

  // Vérifier que l'organisme est valide
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide. Doit être SAR ou AMAIR');
  }

  // Empêcher la fermeture des adhésions pour l'année en cours
  if (anneeInt === anneeActuelle) {
    res.status(403);
    throw new Error('Impossible de fermer les adhésions de l\'année en cours');
  }

  const parametre = await Parametre.findOne({ organisme, annee: anneeInt });

  if (!parametre) {
    res.status(404);
    throw new Error(`Paramètres non trouvés pour ${organisme} ${anneeInt}`);
  }

  // Toggle l'état
  parametre.adhesionsOuvertes = !parametre.adhesionsOuvertes;
  await parametre.save();

  res.json({ 
    success: true,
    organisme: parametre.organisme,
    annee: parametre.annee,
    adhesionsOuvertes: parametre.adhesionsOuvertes,
    message: `Adhésions ${parametre.adhesionsOuvertes ? 'ouvertes' : 'fermées'} pour ${organisme} ${anneeInt}`
  });
}));

// @desc    Mettre à jour les tarifs pour un organisme et une année
// @route   PUT /api/settings/:organisme/:annee/tarifs
// @access  Private/Admin
router.put('/:organisme/:annee/tarifs', protect, admin, asyncHandler(async (req, res) => {
  const { tarifs } = req.body;
  const { organisme, annee } = req.params;
  const anneeInt = parseInt(annee);
  const anneeActuelle = new Date().getFullYear();

  // Vérifier que l'organisme est valide
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide. Doit être SAR ou AMAIR');
  }

  if (!tarifs || typeof tarifs !== 'object') {
    res.status(400);
    throw new Error('Format de tarifs invalide');
  }

  // Empêcher la modification des tarifs de l'année en cours
  if (anneeInt === anneeActuelle) {
    res.status(403);
    throw new Error('Modification des tarifs autorisée uniquement pour l\'année N+1');
  }

  const parametre = await Parametre.findOne({ organisme, annee: anneeInt });

  if (!parametre) {
    res.status(404);
    throw new Error(`Paramètres non trouvés pour ${organisme} ${anneeInt}`);
  }

  // Mettre à jour les tarifs
  if (tarifs.loisir !== undefined) {
    parametre.tarifs.loisir = tarifs.loisir;
  }
  if (tarifs.professionnel !== undefined) {
    parametre.tarifs.professionnel = tarifs.professionnel;
  }

  await parametre.save();

  res.json({ 
    success: true,
    message: 'Tarifs mis à jour avec succès',
    parametre 
  });
}));

// @desc    Obtenir les statistiques
// @route   GET /api/settings/statistiques
// @access  Private/Admin
router.get('/statistiques', protect, admin, asyncHandler(async (req, res) => {
  const anneeActuelle = new Date().getFullYear();

  // Compter les adhésions par statut
  const totalAdhesions = await Adhesion.countDocuments({ annee: anneeActuelle });
  const adhesionsEnCours = await Adhesion.countDocuments({ 
    annee: anneeActuelle,
    status: 'en_cours' 
  });
  const adhesionsValidees = await Adhesion.countDocuments({ 
    annee: anneeActuelle,
    status: 'actif' 
  });
  const adhesionsAttentePaiement = await Adhesion.countDocuments({ 
    annee: anneeActuelle,
    status: 'en_attente' 
  });

  // Compter par organisme
  const adhesionsSAR = await Adhesion.countDocuments({ 
    annee: anneeActuelle,
    organismes: 'SAR' 
  });
  const adhesionsAMAIR = await Adhesion.countDocuments({ 
    annee: anneeActuelle,
    organismes: 'AMAIR' 
  });

  res.json({
    annee: anneeActuelle,
    total: totalAdhesions,
    enCours: adhesionsEnCours,
    validees: adhesionsValidees,
    attentePaiement: adhesionsAttentePaiement,
    parOrganisme: {
      SAR: adhesionsSAR,
      AMAIR: adhesionsAMAIR
    }
  });
}));

// @desc    Obtenir les années disponibles pour les adhésions
// @route   GET /api/settings/annees-disponibles
// @access  Public
router.get('/annees-disponibles', asyncHandler(async (req, res) => {
  const anneeActuelle = new Date().getFullYear();
  
  // Récupérer tous les paramètres
  const parametres = await Parametre.find({})
    .sort({ annee: -1, organisme: 1 });

  // Grouper par année
  const anneesMap = new Map();
  
  parametres.forEach(param => {
    if (!anneesMap.has(param.annee)) {
      anneesMap.set(param.annee, {
        annee: param.annee,
        estAnneeEnCours: param.estAnneeEnCours,
        organismes: []
      });
    }
    
    anneesMap.get(param.annee).organismes.push({
      organisme: param.organisme,
      tarifs: param.tarifs,
      adhesionsOuvertes: param.adhesionsOuvertes
    });
  });

  const anneesDisponibles = Array.from(anneesMap.values());

  res.json({
    anneesDisponibles,
    anneeActuelle
  });
}));

module.exports = router;
