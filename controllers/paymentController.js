const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const asyncHandler = require('express-async-handler');
const nodemailer = require('nodemailer');
const Adhesion = require('../models/adhesionModel');

// Configuration du transporteur SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// @desc    Créer une session de paiement Stripe
// @route   POST /api/payment/create-session/:adhesionId
// @access  Private
const createPaymentSession = asyncHandler(async (req, res) => {
  const { adhesionId } = req.params;

  const adhesion = await Adhesion.findById(adhesionId).populate(
    'user',
    'prenom nom email'
  );

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Vérifier que l'utilisateur est propriétaire
  if (adhesion.user._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Vérifier que le paiement n'a pas déjà été effectué
  if (adhesion.paiement.status === 'paye') {
    res.status(400);
    throw new Error('Cette adhésion a déjà été payée');
  }

  try {
    // Créer une session de paiement Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Adhésion ${adhesion.organisme} ${adhesion.annee}`,
              description: `Adhésion à ${
                adhesion.organisme === 'SAR'
                  ? 'Syndicat des Apiculteurs Réunis'
                  : 'Association des Miels et Apiculteurs Indépendants Réunis'
              } - ${adhesion.typeApiculture}`,
            },
            unit_amount: Math.round(adhesion.paiement.montant * 100), // Montant en centimes
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/paiement/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/reglement-adhesion/${adhesionId}`,
      customer_email: adhesion.user.email,
      metadata: {
        adhesionId: adhesion._id.toString(),
        userId: adhesion.user._id.toString(),
      },
    });

    // Enregistrer l'ID de session dans l'adhésion
    adhesion.paiement.stripeSessionId = session.id;
    await adhesion.save();

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Erreur création session Stripe:', error);
    res.status(500);
    throw new Error('Erreur lors de la création de la session de paiement');
  }
});

// @desc    Webhook Stripe pour confirmer le paiement
// @route   POST /api/payment/webhook
// @access  Public (mais sécurisé par signature Stripe)
const handleStripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Erreur webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Gérer l'événement de paiement réussi
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      // Mettre à jour l'adhésion
      const adhesion = await Adhesion.findById(session.metadata.adhesionId).populate(
        'user',
        'prenom nom email'
      );

      if (adhesion) {
        adhesion.paiement.status = 'paye';
        adhesion.paiement.datePaiement = new Date();
        adhesion.paiement.stripePaymentIntentId = session.payment_intent;
        adhesion.status = 'actif';
        await adhesion.save();

        // Envoyer email de confirmation à l'utilisateur
        await transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: adhesion.user.email,
          subject: `Confirmation de paiement - Adhésion ${adhesion.organisme} ${adhesion.annee}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #10B981;">✅ Paiement confirmé</h2>
              
              <p>Bonjour ${adhesion.user.prenom} ${adhesion.user.nom},</p>
              
              <p>Nous avons bien reçu votre paiement de <strong>${adhesion.paiement.montant.toFixed(2)} €</strong>.</p>
              
              <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Organisme :</strong> ${adhesion.organisme}</p>
                <p style="margin: 5px 0;"><strong>Année :</strong> ${adhesion.annee}</p>
                <p style="margin: 5px 0;"><strong>Type :</strong> ${adhesion.typeApiculture}</p>
                <p style="margin: 5px 0;"><strong>Date de paiement :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
              </div>
              
              <p>Votre adhésion est maintenant <strong style="color: #10B981;">active</strong>.</p>
              
              <p>Vous pouvez consulter votre adhésion à tout moment depuis votre espace personnel.</p>
              
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
              
              <p style="color: #6B7280; font-size: 12px;">
                Merci de votre confiance,<br>
                L'équipe ${adhesion.organisme}
              </p>
            </div>
          `,
        });

        // Envoyer notification à l'admin (optionnel)
        // Vous pouvez ajouter une notification admin ici si nécessaire

        console.log(`✅ Paiement confirmé pour l'adhésion ${adhesion._id}`);
      }
    } catch (error) {
      console.error('Erreur traitement webhook:', error);
    }
  }

  res.json({ received: true });
});

// @desc    Vérifier le statut d'une session de paiement
// @route   GET /api/payment/session/:sessionId
// @access  Private
const getSessionStatus = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      status: session.payment_status,
      customerEmail: session.customer_email,
      amountTotal: session.amount_total / 100,
    });
  } catch (error) {
    console.error('Erreur récupération session:', error);
    res.status(500);
    throw new Error('Erreur lors de la récupération de la session');
  }
});

module.exports = {
  createPaymentSession,
  handleStripeWebhook,
  getSessionStatus,
};
