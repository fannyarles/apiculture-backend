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
  const anneeSelectionnee = req.query.annee ? parseInt(req.query.annee) : anneeActuelle;

  // Fonction pour obtenir les stats par organisme pour une année donnée
  const getStatsParOrganisme = async (annee) => {
    const stats = await Adhesion.aggregate([
      { $match: { annee: annee } },
      {
        $group: {
          _id: '$organisme',
          total: { $sum: 1 },
          actifs: {
            $sum: { $cond: [{ $eq: ['$status', 'actif'] }, 1, 0] }
          },
          enCours: {
            $sum: { $cond: [{ $in: ['$status', ['en_attente', 'en_cours']] }, 1, 0] }
          },
          attentePaiement: {
            $sum: { $cond: [{ $eq: ['$status', 'paiement_demande'] }, 1, 0] }
          }
        }
      }
    ]);
    return stats;
  };

  // Obtenir les années disponibles (années où il y a des adhésions)
  const anneesDisponibles = await Adhesion.distinct('annee');
  anneesDisponibles.sort((a, b) => b - a); // Tri décroissant

  // Obtenir les stats pour l'année sélectionnée
  const statsAnnee = await getStatsParOrganisme(anneeSelectionnee);

  // Vérifier si les adhésions pour l'année suivante sont ouvertes
  const parametreSuivant = await Parametre.findOne({ 
    annee: anneeActuelle + 1, 
    adhesionsOuvertes: true 
  });

  res.json({
    anneeActuelle,
    anneeSelectionnee,
    anneesDisponibles,
    stats: statsAnnee,
    adhesionsSuivantesOuvertes: !!parametreSuivant
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
