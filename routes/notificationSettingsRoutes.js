const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { superAdmin } = require('../middleware/superAdminMiddleware');
const {
  getAdminNotificationSettings,
  updateAdminNotificationSettings,
  getAllNotificationSettings,
  deleteAdminNotificationSettings,
  getNotificationSettingsStructure,
} = require('../controllers/notificationSettingsController');

// Routes super-admin uniquement
router.use(protect);
router.use(superAdmin);

// Obtenir la structure des notifications (pour l'UI)
router.get('/structure', getNotificationSettingsStructure);

// Obtenir tous les paramètres de notification
router.get('/', getAllNotificationSettings);

// Obtenir, mettre à jour ou supprimer les paramètres d'un admin spécifique
router.route('/:userId')
  .get(getAdminNotificationSettings)
  .put(updateAdminNotificationSettings)
  .delete(deleteAdminNotificationSettings);

module.exports = router;
