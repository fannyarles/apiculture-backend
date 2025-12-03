const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/parametreControllerNew');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes publiques
router.get('/current', getCurrentYearParametres);
router.get('/annees-disponibles', getAnneesDisponibles);
router.get('/:organisme/:annee', getParametreByOrganismeAnnee);

// Routes admin
router.get('/', protect, admin, getAllParametres);
router.post('/', protect, admin, createParametre);
router.put('/:organisme/:annee/tarifs', protect, admin, updateTarifs);
router.put('/:organisme/:annee/toggle-adhesions', protect, admin, toggleAdhesions);
router.get('/statistiques/all', protect, admin, getStatistiques);

// Routes pour cron jobs (à sécuriser avec un token spécifique en production)
router.post('/init-nouvelle-annee', protect, admin, initNouvelleAnnee);
router.post('/update-annee-en-cours', protect, admin, updateAnneeEnCours);

module.exports = router;
