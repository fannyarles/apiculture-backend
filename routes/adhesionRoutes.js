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
} = require('../controllers/adhesionController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes utilisateur
router.post('/', protect, createAdhesion);
router.get('/my', protect, getMyAdhesions);
router.get('/my-adhesions', protect, getMyAdhesions); // Alias pour compatibilité frontend

// Route mixte : retourne les adhésions selon le rôle
router.get('/', protect, async (req, res, next) => {
  // Si admin, appeler getAllAdhesions, sinon getMyAdhesions
  if (req.user.role === 'admin') {
    return getAllAdhesions(req, res, next);
  } else {
    return getMyAdhesions(req, res, next);
  }
});

router.get('/:id', protect, getAdhesionById);

// Routes admin
router.put('/:id/status', protect, admin, updateAdhesionStatus);
router.post('/:id/request-payment', protect, admin, requestPayment);
router.delete('/:id', protect, admin, deleteAdhesion);
router.get('/stats/summary', protect, admin, getStats);

module.exports = router;
