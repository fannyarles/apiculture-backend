const express = require('express');
const router = express.Router();
const {
  getServiceSettings,
  updateServiceSettings,
  toggleService,
} = require('../controllers/serviceSettingsController');
const { protect, admin } = require('../middleware/authMiddleware');

// Route publique pour récupérer les paramètres
router.get('/', getServiceSettings);

// Routes admin/super_admin
router.put('/', protect, admin, updateServiceSettings);
router.put('/toggle/:service', protect, admin, toggleService);

module.exports = router;
