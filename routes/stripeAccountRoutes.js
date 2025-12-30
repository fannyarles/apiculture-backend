const express = require('express');
const router = express.Router();
const {
  getBalance,
  getTransactions,
  getPayments,
} = require('../controllers/stripeAccountController');
const { protect, admin } = require('../middleware/authMiddleware');

// Toutes les routes nécessitent d'être admin (vérification fine dans le controller)
router.get('/balance', protect, admin, getBalance);
router.get('/transactions', protect, admin, getTransactions);
router.get('/payments', protect, admin, getPayments);

module.exports = router;
