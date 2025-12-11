const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { superAdmin } = require('../middleware/superAdminMiddleware');
const {
  getAdminPermissions,
  updateAdminPermissions,
  getAllPermissions,
  deleteAdminPermissions,
  getMyPermissions,
  getPermissionsStructure,
} = require('../controllers/permissionController');

// Route pour obtenir ses propres permissions (admin connecté)
router.get('/me', protect, getMyPermissions);

// Routes super-admin uniquement
router.use(protect);
router.use(superAdmin);

// Obtenir la structure des permissions (pour l'UI)
router.get('/structure', getPermissionsStructure);

// Obtenir toutes les permissions
router.get('/', getAllPermissions);

// Obtenir, mettre à jour ou supprimer les permissions d'un admin spécifique
router.route('/:userId')
  .get(getAdminPermissions)
  .put(updateAdminPermissions)
  .delete(deleteAdminPermissions);

module.exports = router;
