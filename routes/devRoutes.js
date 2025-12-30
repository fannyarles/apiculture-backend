const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getPdfTypes,
  generateTestPdf,
} = require('../controllers/devController');

// Middleware pour vérifier si l'utilisateur est super_admin
const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    res.status(403);
    throw new Error('Accès refusé - Super Admin uniquement');
  }
};

// Toutes les routes sont protégées et réservées aux super admins
router.use(protect);
router.use(superAdminOnly);

// Routes pour les outils de développement PDF
router.get('/pdf-types', getPdfTypes);
router.get('/generate-pdf/:type', generateTestPdf);

module.exports = router;
