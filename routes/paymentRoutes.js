const express = require('express');
const router = express.Router();
const {
  createPaymentSession,
  handleStripeWebhook,
  getSessionStatus,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

// Routes de paiement
router.post('/create-session/:adhesionId', protect, createPaymentSession);
router.get('/session/:sessionId', protect, getSessionStatus);

// Webhook Stripe (pas de protection auth car Stripe envoie les requêtes)
// Note: Le webhook nécessite le body brut, pas du JSON parsé
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
