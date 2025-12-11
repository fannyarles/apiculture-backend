const express = require('express');
const router = express.Router();
const {
  getOrganismes,
  getOrganismeById,
  createOrganisme,
  updateOrganisme,
  deleteOrganisme,
  getOrganismeStats,
} = require('../controllers/organismeController');
const { protect } = require('../middleware/authMiddleware');
const { superAdmin } = require('../middleware/superAdminMiddleware');

// Toutes les routes nécessitent d'être super-admin
router.use(protect, superAdmin);

router.route('/')
  .get(getOrganismes)
  .post(createOrganisme);

router.route('/:id')
  .get(getOrganismeById)
  .put(updateOrganisme)
  .delete(deleteOrganisme);

router.get('/:id/stats', getOrganismeStats);

module.exports = router;
