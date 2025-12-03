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
  tls: {
    rejectUnauthorized: false
  }
});

// @desc    Créer une session de paiement Stripe
// @route   POST /api/payment/create-payment-session/:adhesionId
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

  // Déterminer le compte Stripe de destination selon l'organisme
  const destinationAccount = adhesion.organisme === 'SAR' 
    ? process.env.STRIPE_ACCOUNT_SAR 
    : process.env.STRIPE_ACCOUNT_AMAIR;

  if (!destinationAccount) {
    console.warn(`⚠️  Compte Stripe non configuré pour ${adhesion.organisme}. Le paiement ira sur le compte principal.`);
  }

  try {
    // Créer une session de paiement Stripe
    const sessionConfig = {
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
              }`,
            },
            unit_amount: Math.round(adhesion.paiement.montant * 100), // Montant en centimes
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard?canceled=true`,
      customer_email: adhesion.user.email,
      metadata: {
        adhesionId: adhesion._id.toString(),
        userId: adhesion.user._id.toString(),
        organisme: adhesion.organisme,
      },
    };

    // Ajouter le transfert automatique si un compte de destination est configuré
    if (destinationAccount) {
      sessionConfig.payment_intent_data = {
        application_fee_amount: 0, // Pas de frais de plateforme (100% à l'organisme)
        transfer_data: {
          destination: destinationAccount,
        },
      };
      console.log(`💸 Paiement configuré pour transfert vers ${adhesion.organisme} (${destinationAccount})`);
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Enregistrer l'ID de session dans l'adhésion
    // Utiliser updateOne pour éviter la validation complète du document
    await Adhesion.updateOne(
      { _id: adhesionId },
      { 
        $set: { 
          'paiement.stripeSessionId': session.id,
          'paiement.status': 'demande'
        } 
      }
    );

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Erreur création session Stripe:', error);
    console.error('Détails:', error.message);
    console.error('Type:', error.type);
    res.status(500);
    throw new Error(`Erreur Stripe: ${error.message || 'Erreur lors de la création de la session de paiement'}`);
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
          from: `"${process.env.PLATFORM_NAME}" ${process.env.SMTP_FROM_EMAIL}`,
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

// @desc    Obtenir les informations d'adhésion pour le paiement
// @route   GET /api/payment/adhesion/:adhesionId
// @access  Private
const getAdhesionForPayment = asyncHandler(async (req, res) => {
  const { adhesionId } = req.params;

  const adhesion = await Adhesion.findById(adhesionId).populate('user', 'prenom nom email');

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Vérifier que l'utilisateur est propriétaire
  if (adhesion.user._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  res.json({
    _id: adhesion._id,
    organisme: adhesion.organisme,
    annee: adhesion.annee,
    montant: adhesion.paiement.montant,
    status: adhesion.paiement.status,
    typePaiement: adhesion.paiement.typePaiement,
    user: {
      prenom: adhesion.user.prenom,
      nom: adhesion.user.nom,
      email: adhesion.user.email
    }
  });
});

// @desc    Envoyer un lien de paiement par email
// @route   POST /api/payment/send-link/:adhesionId
// @access  Private/Admin
const sendPaymentLink = asyncHandler(async (req, res) => {
  const { adhesionId } = req.params;

  const adhesion = await Adhesion.findById(adhesionId).populate('user', 'prenom nom email');

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Créer l'URL de paiement
  const paymentUrl = `${process.env.FRONTEND_URL}/reglement-adhesion/${adhesionId}`;

  // Envoyer l'email
  try {
    await transporter.sendMail({
      from: `"${process.env.PLATFORM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: adhesion.user.email,
      subject: `Lien de paiement - Adhésion ${adhesion.organisme} ${adhesion.annee}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Finaliser votre adhésion</h2>
          
          <p>Bonjour ${adhesion.user.prenom} ${adhesion.user.nom},</p>
          
          <p>Votre demande d'adhésion a été validée. Pour finaliser votre inscription, veuillez procéder au paiement de <strong>${adhesion.paiement.montant.toFixed(2)} €</strong>.</p>
          
          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Organisme :</strong> ${adhesion.organisme}</p>
            <p style="margin: 5px 0;"><strong>Année :</strong> ${adhesion.annee}</p>
            <p style="margin: 5px 0;"><strong>Montant :</strong> ${adhesion.paiement.montant.toFixed(2)} €</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${paymentUrl}" style="display: inline-block; padding: 12px 30px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Procéder au paiement
            </a>
          </div>
          
          <p style="color: #6B7280; font-size: 14px;">
            Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br>
            <a href="${paymentUrl}">${paymentUrl}</a>
          </p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
          
          <p style="color: #6B7280; font-size: 12px;">
            Cordialement,<br>
            L'équipe ${adhesion.organisme}
          </p>
        </div>
      `,
    });

    adhesion.paiement.lienEnvoye = true;
    adhesion.paiement.dateLienEnvoye = new Date();
    await adhesion.save();

    res.json({ 
      success: true,
      message: 'Lien de paiement envoyé avec succès' 
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    res.status(500);
    throw new Error('Erreur lors de l\'envoi du lien de paiement');
  }
});

// @desc    Demander un paiement (créer une demande)
// @route   POST /api/payment/request-payment
// @access  Private/Admin
const requestPayment = asyncHandler(async (req, res) => {
  const { adhesionId } = req.body;

  const adhesion = await Adhesion.findById(adhesionId).populate('user', 'prenom nom email');

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Mettre à jour le statut
  adhesion.status = 'paiement_demande';
  adhesion.paiement.status = 'demande';
  await adhesion.save();

  // Envoyer automatiquement le lien de paiement
  const paymentUrl = `${process.env.FRONTEND_URL}/reglement-adhesion/${adhesionId}`;

  try {
    await transporter.sendMail({
      from: `"${process.env.PLATFORM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: adhesion.user.email,
      subject: `Demande de paiement - Adhésion ${adhesion.organisme} ${adhesion.annee}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Paiement de votre adhésion</h2>
          
          <p>Bonjour ${adhesion.user.prenom} ${adhesion.user.nom},</p>
          
          <p>Votre adhésion est en attente de paiement. Montant à régler : <strong>${adhesion.paiement.montant.toFixed(2)} €</strong>.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${paymentUrl}" style="display: inline-block; padding: 12px 30px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Payer maintenant
            </a>
          </div>
          
          <p style="color: #6B7280; font-size: 12px;">
            Cordialement,<br>
            L'équipe ${adhesion.organisme}
          </p>
        </div>
      `,
    });

    res.json({ 
      success: true,
      message: 'Demande de paiement envoyée',
      adhesion: {
        _id: adhesion._id,
        status: adhesion.status,
        paiement: adhesion.paiement
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    res.status(500);
    throw new Error('Erreur lors de l\'envoi de la demande de paiement');
  }
});

module.exports = {
  createPaymentSession,
  handleStripeWebhook,
  getSessionStatus,
  getAdhesionForPayment,
  sendPaymentLink,
  requestPayment,
};
