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
} = require('../controllers/parametreControllerNew');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes publiques - IMPORTANT: Les routes spécifiques doivent être AVANT les routes avec paramètres ET avant les routes protégées
router.get('/annees-disponibles', getAnneesDisponibles);
router.get('/current', getCurrentYearParametres);
router.get('/:organisme/:annee', getParametreByOrganismeAnnee);

// Routes admin - IMPORTANT: Les routes protégées doivent être APRÈS les routes publiques
router.post('/', protect, admin, createParametre);
router.put('/:id/tarifs', protect, admin, updateTarifs);
router.put('/:id/toggle-adhesions', protect, admin, toggleAdhesions);
router.get('/', protect, admin, getAllParametres);

module.exports = router;
