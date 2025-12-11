const express = require('express');
const router = express.Router();
const {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  resetAdminPassword,
} = require('../controllers/adminManagementController');
const { protect } = require('../middleware/authMiddleware');
const { superAdmin } = require('../middleware/superAdminMiddleware');

// Toutes les routes nécessitent d'être super-admin
router.use(protect, superAdmin);

router.route('/admins')
  .get(getAdmins)
  .post(createAdmin);

router.route('/admins/:id')
  .put(updateAdmin)
  .delete(deleteAdmin);

router.post('/admins/:id/reset-password', resetAdminPassword);

module.exports = router;
