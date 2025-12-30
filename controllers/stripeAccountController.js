const asyncHandler = require('express-async-handler');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Permission = require('../models/permissionModel');

// @desc    Récupérer le solde du compte Stripe
// @route   GET /api/stripe-account/balance
// @access  Private/Admin avec permission finances
const getBalance = asyncHandler(async (req, res) => {
  // Vérifier les permissions
  const hasAccess = await checkFinanceAccess(req.user);
  if (!hasAccess) {
    res.status(403);
    throw new Error('Accès non autorisé');
  }

  try {
    const balance = await stripe.balance.retrieve();

    // Formater les montants (Stripe retourne en centimes)
    const formatAmount = (amount) => (amount / 100).toFixed(2);

    const available = balance.available.map(b => ({
      amount: formatAmount(b.amount),
      currency: b.currency.toUpperCase(),
      amountRaw: b.amount,
    }));

    const pending = balance.pending.map(b => ({
      amount: formatAmount(b.amount),
      currency: b.currency.toUpperCase(),
      amountRaw: b.amount,
    }));

    res.json({
      available,
      pending,
      livemode: balance.livemode,
    });
  } catch (error) {
    console.error('Erreur Stripe Balance:', error);
    res.status(500);
    throw new Error('Erreur lors de la récupération du solde Stripe');
  }
});

// @desc    Récupérer les dernières transactions
// @route   GET /api/stripe-account/transactions
// @access  Private/Admin avec permission finances
const getTransactions = asyncHandler(async (req, res) => {
  // Vérifier les permissions
  const hasAccess = await checkFinanceAccess(req.user);
  if (!hasAccess) {
    res.status(403);
    throw new Error('Accès non autorisé');
  }

  const { limit = 10 } = req.query;

  try {
    const transactions = await stripe.balanceTransactions.list({
      limit: parseInt(limit),
    });

    const formattedTransactions = transactions.data.map(t => ({
      id: t.id,
      type: t.type,
      amount: (t.amount / 100).toFixed(2),
      currency: t.currency.toUpperCase(),
      net: (t.net / 100).toFixed(2),
      fee: (t.fee / 100).toFixed(2),
      status: t.status,
      created: new Date(t.created * 1000).toISOString(),
      description: t.description,
    }));

    res.json({
      transactions: formattedTransactions,
      hasMore: transactions.has_more,
    });
  } catch (error) {
    console.error('Erreur Stripe Transactions:', error);
    res.status(500);
    throw new Error('Erreur lors de la récupération des transactions');
  }
});

// @desc    Récupérer les derniers paiements
// @route   GET /api/stripe-account/payments
// @access  Private/Admin avec permission finances
const getPayments = asyncHandler(async (req, res) => {
  // Vérifier les permissions
  const hasAccess = await checkFinanceAccess(req.user);
  if (!hasAccess) {
    res.status(403);
    throw new Error('Accès non autorisé');
  }

  const { limit = 10 } = req.query;

  try {
    const payments = await stripe.paymentIntents.list({
      limit: parseInt(limit),
    });

    const formattedPayments = payments.data.map(p => ({
      id: p.id,
      amount: (p.amount / 100).toFixed(2),
      currency: p.currency.toUpperCase(),
      status: p.status,
      created: new Date(p.created * 1000).toISOString(),
      description: p.description,
      customerEmail: p.receipt_email,
    }));

    res.json({
      payments: formattedPayments,
      hasMore: payments.has_more,
    });
  } catch (error) {
    console.error('Erreur Stripe Payments:', error);
    res.status(500);
    throw new Error('Erreur lors de la récupération des paiements');
  }
});

// Fonction helper pour vérifier l'accès aux finances
const checkFinanceAccess = async (user) => {
  // Super admin a toujours accès
  if (user.role === 'super_admin') {
    return true;
  }

  // Vérifier la permission finances.access
  const permissions = await Permission.findOne({ userId: user._id });
  return permissions?.finances?.access === true;
};

module.exports = {
  getBalance,
  getTransactions,
  getPayments,
};
