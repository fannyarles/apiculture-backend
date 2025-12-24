const express = require('express');
const router = express.Router();
const {
  getComposition,
  getEligibleMembers,
  addRole,
  removeRole,
  getUserRoles,
  getCompositionHistorique,
  downloadCompositionPDF,
} = require('../controllers/compositionController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes publiques
router.get('/:organisme', getComposition);

// Routes admin
router.get('/user/:userId', protect, admin, getUserRoles);
router.get('/:organisme/eligible', protect, admin, getEligibleMembers);
router.get('/:organisme/historique', protect, admin, getCompositionHistorique);
router.get('/:organisme/historique/download', protect, admin, downloadCompositionPDF);
router.post('/:organisme/role', protect, admin, addRole);
router.delete('/:organisme/role/:userId/:roleIndex', protect, admin, removeRole);

module.exports = router;
