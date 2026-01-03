const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// Configuration multer pour upload en mémoire
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Type de fichier non autorisé. Formats acceptés: JPEG, PNG, PDF'));
};
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: fileFilter
});

const {
  createPaymentSession,
  handleStripeWebhook,
  getSessionStatus,
  getAdhesionForPayment,
  sendPaymentLink,
  requestPayment,
  markPaymentAsPaid,
  createServicePaymentSession,
  markServicePaymentAsPaid,
  getServiceForPayment,
  getPendingPayments,
  createUNAFModificationPaymentSession,
} = require('../controllers/paymentController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes de paiement
router.post('/create-payment-session/:adhesionId', protect, createPaymentSession);
router.get('/session/:sessionId', protect, getSessionStatus);
router.get('/status/:sessionId', protect, getSessionStatus); // Alias pour compatibilité frontend
router.get('/adhesion/:adhesionId', protect, getAdhesionForPayment);
router.post('/send-link/:adhesionId', protect, admin, sendPaymentLink);
router.post('/request-payment', protect, admin, requestPayment);
router.post('/mark-paid/:adhesionId', protect, admin, upload.single('documentPaiement'), markPaymentAsPaid);
router.get('/pending', protect, admin, getPendingPayments);

// Routes de paiement pour les services
router.post('/service/create-payment-session/:serviceId', protect, createServicePaymentSession);
router.get('/service/:serviceId', protect, getServiceForPayment);
router.post('/service/mark-paid/:serviceId', protect, admin, upload.single('documentPaiement'), markServicePaymentAsPaid);
router.post('/service-modification/:serviceId/create-session', protect, createUNAFModificationPaymentSession);

// Webhook Stripe (pas de protection auth car Stripe envoie les requêtes)
// Note: Le webhook nécessite le body brut, pas du JSON parsé
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
