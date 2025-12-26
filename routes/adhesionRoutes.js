const express = require('express');
const router = express.Router();
const {
  createAdhesion,
  getMyAdhesions,
  getAdhesionById,
  getAllAdhesions,
  updateAdhesionStatus,
  requestPayment,
  deleteAdhesion,
  getStats,
  sendHelpRequest,
  generateAdhesionPDFController,
  downloadAttestation,
} = require('../controllers/adhesionController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes utilisateur
router.post('/', protect, createAdhesion);
router.get('/my-adhesions', protect, getMyAdhesions);
router.get('/user', protect, getMyAdhesions); // Alias pour /my-adhesions

// Route mixte : retourne les adhésions selon le rôle
router.get('/', protect, async (req, res, next) => {
  // Si admin ou super_admin, appeler getAllAdhesions, sinon getMyAdhesions
  if (req.user.role === 'admin' || req.user.role === 'super_admin') {
    return getAllAdhesions(req, res, next);
  } else {
    return getMyAdhesions(req, res, next);
  }
});

// Routes avec paramètres - DOIVENT être après les routes spécifiques
router.get('/:id', protect, getAdhesionById);
router.post('/:id/demande-aide', protect, sendHelpRequest);
router.post('/:id/generate-pdf', protect, generateAdhesionPDFController);
router.get('/:id/attestation', protect, downloadAttestation);

// Routes admin
router.put('/:id/status', protect, admin, updateAdhesionStatus);
router.post('/:id/request-payment', protect, admin, requestPayment);
router.delete('/:id', protect, admin, deleteAdhesion);
router.get('/stats/summary', protect, admin, getStats);

module.exports = router;
