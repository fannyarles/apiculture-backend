const express = require('express');
const router = express.Router();
const {
  getParametres,
  getActiveParametres,
  getParametreByAnnee,
  createParametre,
  updateParametre,
  deleteParametre,
  toggleActiveParametre,
} = require('../controllers/parametreController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes publiques
router.get('/', getParametres);
router.get('/active', getActiveParametres);
router.get('/:annee', getParametreByAnnee);

// Routes admin
router.post('/', protect, admin, createParametre);
router.put('/:id', protect, admin, updateParametre);
router.delete('/:id', protect, admin, deleteParametre);
router.put('/:id/toggle-active', protect, admin, toggleActiveParametre);

module.exports = router;
