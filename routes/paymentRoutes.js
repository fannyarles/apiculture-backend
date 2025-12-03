const express = require('express');
const router = express.Router();
const {
  createPaymentSession,
  handleStripeWebhook,
  getSessionStatus,
  getAdhesionForPayment,
  sendPaymentLink,
  requestPayment,
} = require('../controllers/paymentController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes de paiement
router.post('/create-payment-session/:adhesionId', protect, createPaymentSession);
router.get('/session/:sessionId', protect, getSessionStatus);
router.get('/status/:sessionId', protect, getSessionStatus); // Alias pour compatibilité frontend
router.get('/adhesion/:adhesionId', protect, getAdhesionForPayment);
router.post('/send-link/:adhesionId', protect, admin, sendPaymentLink);
router.post('/request-payment', protect, admin, requestPayment);

// Webhook Stripe (pas de protection auth car Stripe envoie les requêtes)
// Note: Le webhook nécessite le body brut, pas du JSON parsé
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
