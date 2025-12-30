const express = require('express');
const router = express.Router();
const {
  getStats,
  getExportList,
  getPendingPayments,
  generateExport,
  downloadExport,
  getExportDates,
  deleteExport,
  sendExport,
} = require('../controllers/unafExportController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes accessibles aux admins
router.get('/stats', protect, admin, getStats);
router.get('/list', protect, admin, getExportList);
router.get('/pending', protect, admin, getPendingPayments);
router.get('/dates', protect, admin, getExportDates);
router.get('/download/:id', protect, admin, downloadExport);

// Routes réservées aux super admins (vérification dans le controller)
router.post('/generate', protect, admin, generateExport);
router.delete('/:id', protect, admin, deleteExport);
router.put('/:id/send', protect, admin, sendExport);

module.exports = router;
