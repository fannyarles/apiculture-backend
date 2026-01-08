const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { superAdmin } = require('../middleware/superAdminMiddleware');
const {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  purgeServices,
} = require('../controllers/superAdminController');

// Toutes les routes nécessitent authentification + super_admin
router.use(protect);
router.use(superAdmin);

router.route('/admins')
  .get(getAdmins)
  .post(createAdmin);

router.route('/admin/:id')
  .put(updateAdmin)
  .delete(deleteAdmin);

// Route de purge
router.delete('/purge/services', purgeServices);

module.exports = router;
