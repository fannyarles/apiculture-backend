const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const asyncHandler = require('express-async-handler');
const nodemailer = require('nodemailer');
const Adhesion = require('../models/adhesionModel');
const Service = require('../models/serviceModel');
const Permission = require('../models/permissionModel');
const { generateAndUploadAttestation, generateAndUploadBulletinAdhesion } = require('../services/pdfService');
const { notifyAdminsAdhesionPayment, notifyAdminsServicePayment } = require('../services/adminNotificationService');
const { uploadFile, getSignedUrl, downloadAndUploadStripeReceipt } = require('../services/s3Service');

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

// @desc    Marquer un paiement comme effectué manuellement (admin)
// @route   POST /api/payment/mark-paid/:adhesionId
// @access  Private/Admin (avec permission changeAdherentStatus)
const markPaymentAsPaid = asyncHandler(async (req, res) => {
  // Vérifier les permissions
  if (req.user?.role !== 'super_admin') {
    const permissions = await Permission.findOne({ userId: req.user._id });
    if (!permissions?.adhesions?.changeAdherentStatus) {
      res.status(403);
      throw new Error('Accès refusé - Permission insuffisante');
    }
  }

  const { adhesionId } = req.params;
  const { typePaiement, datePaiement, note } = req.body;

  if (!typePaiement || !['cheque', 'espece'].includes(typePaiement)) {
    res.status(400);
    throw new Error('Mode de paiement invalide (cheque ou espece)');
  }

  if (!datePaiement) {
    res.status(400);
    throw new Error('La date de paiement est requise');
  }

  const adhesion = await Adhesion.findById(adhesionId).populate('user', 'prenom nom email telephoneMobile telephone adresse dateNaissance');

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  if (adhesion.paiement?.status === 'paye') {
    res.status(400);
    throw new Error('Cette adhésion est déjà marquée comme payée');
  }

  adhesion.paiement.status = 'paye';
  adhesion.paiement.typePaiement = typePaiement;
  adhesion.paiement.datePaiement = new Date(datePaiement);
  adhesion.paiement.note = note !== undefined ? note : adhesion.paiement.note;
  adhesion.status = 'actif';
  adhesion.dateValidation = new Date();

  // Gérer l'upload du document de paiement si fourni
  if (req.file) {
    try {
      const fileName = `preuve_paiement_${adhesion._id}_${Date.now()}${require('path').extname(req.file.originalname)}`;
      const s3Result = await uploadFile(
        req.file.buffer,
        fileName,
        req.file.mimetype,
        `adhesions/${adhesion._id}/documents-paiement`
      );

      adhesion.documentPaiement = {
        nom: req.file.originalname,
        key: s3Result.key,
        url: s3Result.url,
        dateUpload: new Date(),
        uploadePar: req.user._id
      };
      console.log(`📎 Document de paiement uploadé pour l'adhésion ${adhesion._id}`);
    } catch (uploadError) {
      console.error('Erreur upload document paiement:', uploadError);
      // Ne pas bloquer le processus si l'upload échoue
    }
  }
  
  await adhesion.save();

  // Générer et uploader l'attestation d'adhésion
  try {
    const attestationResult = await generateAndUploadAttestation(adhesion);
    adhesion.attestationKey = attestationResult.key;
    adhesion.attestationUrl = attestationResult.url;
    await adhesion.save();
  } catch (attestationError) {
    console.error('Erreur lors de la génération de l\'attestation:', attestationError);
    // Ne pas bloquer le processus si l'attestation échoue
  }

  // CASCADE SAR -> AMAIR : Si adhésion SAR devient active, activer les adhésions AMAIR en attente
  if (adhesion.organisme === 'SAR') {
    const adhesionAMAIREnAttente = await Adhesion.findOne({
      user: adhesion.user._id,
      organisme: 'AMAIR',
      annee: adhesion.annee,
      status: { $in: ['en_attente', 'paiement_demande'] },
      'informationsSpecifiques.AMAIR.adherentSAR': true,
    });

    if (adhesionAMAIREnAttente) {
      adhesionAMAIREnAttente.status = 'actif';
      adhesionAMAIREnAttente.dateValidation = new Date();
      await adhesionAMAIREnAttente.save();
      console.log(`✅ Adhésion AMAIR ${adhesionAMAIREnAttente._id} activée suite à l'activation manuelle de l'adhésion SAR`);

      // Générer l'attestation pour l'adhésion AMAIR
      try {
        const attestationAMAIRCascade = await generateAndUploadAttestation(adhesionAMAIREnAttente);
        adhesionAMAIREnAttente.attestationKey = attestationAMAIRCascade.key;
        adhesionAMAIREnAttente.attestationUrl = attestationAMAIRCascade.url;
        await adhesionAMAIREnAttente.save();
      } catch (attestationError) {
        console.error('Erreur génération attestation AMAIR (cascade):', attestationError);
      }
    }
  }

  // Si adhésion SAR avec adhesionAMAIRGratuite, créer automatiquement l'adhésion AMAIR
  if (adhesion.organisme === 'SAR' && adhesion.adhesionAMAIRGratuite) {
    const existingAMAIR = await Adhesion.findOne({
      user: adhesion.user._id,
      organisme: 'AMAIR',
      annee: adhesion.annee,
    });

    if (!existingAMAIR) {
      try {
        const adhesionAMAIR = new Adhesion({
          user: adhesion.user._id,
          organisme: 'AMAIR',
          annee: adhesion.annee,
          napi: adhesion.napi,
          numeroAmexa: adhesion.numeroAmexa,
          nombreRuches: adhesion.nombreRuches,
          nombreRuchers: adhesion.nombreRuchers,
          localisation: adhesion.localisation,
          siret: adhesion.siret,
          paiement: {
            montant: 0,
            typePaiement: 'gratuit',
            status: 'paye',
            datePaiement: new Date(),
          },
          status: 'actif',
          dateValidation: new Date(),
          informationsPersonnelles: adhesion.informationsPersonnelles,
          informationsSpecifiques: {
            AMAIR: {
              adherentSAR: true,
            },
          },
        });
        await adhesionAMAIR.save();
        
        // Générer l'attestation pour l'adhésion AMAIR gratuite
        try {
          const attestationAMAIR = await generateAndUploadAttestation(adhesionAMAIR);
          adhesionAMAIR.attestationKey = attestationAMAIR.key;
          adhesionAMAIR.attestationUrl = attestationAMAIR.url;
          await adhesionAMAIR.save();
        } catch (attestationError) {
          console.error('Erreur génération attestation AMAIR:', attestationError);
        }
        
        // Générer le bulletin d'adhésion pour l'adhésion AMAIR gratuite
        try {
          const bulletinAMAIR = await generateAndUploadBulletinAdhesion(adhesionAMAIR);
          adhesionAMAIR.bulletinKey = bulletinAMAIR.key;
          adhesionAMAIR.bulletinUrl = bulletinAMAIR.url;
          await adhesionAMAIR.save();
          console.log('✅ Bulletin adhésion AMAIR gratuite généré');
        } catch (bulletinError) {
          console.error('Erreur génération bulletin AMAIR:', bulletinError);
        }
      } catch (error) {
        console.error('Erreur lors de la création de l\'adhésion AMAIR gratuite:', error);
      }
    }
  }

  res.json({
    success: true,
    adhesion,
  });
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
                  ? 'Syndicat Apicole de la Réunion'
                  : 'Association de la Maison de l\'Apiculture de la Réunion'
              }`,
            },
            unit_amount: Math.round(adhesion.paiement.montant * 100), // Montant en centimes
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      locale: 'fr',
      success_url: `${process.env.FRONTEND_URL}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard?canceled=true`,
      customer_email: adhesion.user.email,
      metadata: {
        adhesionId: adhesion._id.toString(),
        userId: adhesion.user._id.toString(),
        organisme: adhesion.organisme,
      },
    };

    // Ajouter les données du payment_intent (receipt_email + transfert si applicable)
    sessionConfig.payment_intent_data = {
      receipt_email: adhesion.user.email,
      metadata: {
        adhesionId: adhesion._id.toString(),
        userId: adhesion.user._id.toString(),
        organisme: adhesion.organisme,
        userEmail: adhesion.user.email,
      },
    };

    // Ajouter le transfert automatique si un compte de destination est configuré
    if (destinationAccount) {
      sessionConfig.payment_intent_data.application_fee_amount = 0; // Pas de frais de plateforme (100% à l'organisme)
      sessionConfig.payment_intent_data.transfer_data = {
        destination: destinationAccount,
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

  console.log(`✅ Webhook activé`);
  
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
      // Vérifier si c'est un paiement de service ou d'adhésion
      if (session.metadata.type === 'service') {
        // Traitement du paiement de service
        const service = await Service.findById(session.metadata.serviceId).populate(
          'user',
          'type prenom nom email adresse telephoneMobile telephone designation raisonSociale'
        );

        if (service) {
          service.paiement.status = 'paye';
          service.paiement.datePaiement = new Date();
          service.paiement.stripePaymentIntentId = session.payment_intent;
          
          // Mettre à jour le statut global
          // Pour UNAF: attendre validation admin après export
          // Pour miellerie: activer si caution reçue, sinon attendre caution
          if (service.typeService === 'assurance_unaf') {
            service.status = 'en_attente_validation';
          } else if (service.caution?.status === 'recu') {
            service.status = 'actif';
            service.dateValidation = new Date();
          } else {
            service.status = 'en_attente_caution';
          }
          
          // Sauvegarder le reçu Stripe sur S3
          try {
            const charge = await stripe.charges.retrieve(session.payment_intent, {
              expand: ['payment_intent']
            }).catch(() => null);
            
            // Si pas trouvé via charges, essayer via payment_intent
            let receiptUrl = charge?.receipt_url;
            if (!receiptUrl) {
              const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
              if (paymentIntent.latest_charge) {
                const chargeFromPI = await stripe.charges.retrieve(paymentIntent.latest_charge);
                receiptUrl = chargeFromPI.receipt_url;
              }
            }
            
            if (receiptUrl) {
              const receiptResult = await downloadAndUploadStripeReceipt(receiptUrl, session.payment_intent, 'service');
              service.receiptKey = receiptResult.key;
              console.log(`✅ Reçu service sauvegardé: ${receiptResult.key}`);
            }
          } catch (receiptError) {
            console.error('Erreur sauvegarde reçu service:', receiptError.message);
          }
          
          await service.save();

          // Générer l'attestation si le service est actif
          if (service.status === 'actif') {
            try {
              const { generateAndUploadServiceAttestation, generateAndUploadEcocontributionAttestation } = require('../services/pdfService');
              const attestationResult = await generateAndUploadServiceAttestation(service);
              service.attestationKey = attestationResult.key;
              service.attestationUrl = attestationResult.url;
              
              // Si c'est un service UNAF avec écocontribution, générer l'attestation écocontribution
              if (service.typeService === 'assurance_unaf' && service.unafData?.options?.ecocontribution?.souscrit) {
                try {
                  const ecoResult = await generateAndUploadEcocontributionAttestation(service);
                  service.ecocontributionAttestationKey = ecoResult.key;
                  service.ecocontributionAttestationUrl = ecoResult.url;
                  console.log('Attestation écocontribution générée:', ecoResult.fileName);
                } catch (ecoError) {
                  console.error('Erreur génération attestation écocontribution:', ecoError);
                }
              }
              
              await service.save();
            } catch (attestationError) {
              console.error('Erreur génération attestation service:', attestationError);
            }
          }

          // Envoyer email de confirmation
          let emailContent;
          
          if (service.typeService === 'assurance_unaf') {
            // Email spécifique pour les services de l'UNAF
            emailContent = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #16a34a;">✅ Paiement confirmé - Services de l'UNAF</h2>
                
                <p>Bonjour ${service.user.prenom} ${service.user.nom},</p>
                
                <p>Nous avons bien reçu votre paiement de <strong>${service.paiement.montant.toFixed(2)} €</strong> pour votre souscription aux services de l'UNAF.</p>
                
                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Service :</strong> ${service.nom}</p>
                  <p style="margin: 5px 0;"><strong>Année :</strong> ${service.annee}</p>
                  <p style="margin: 5px 0;"><strong>Nombre de ruches :</strong> ${service.unafData?.nombreRuches || 'N/A'}</p>
                  <p style="margin: 5px 0;"><strong>Date de paiement :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
                </div>
                
                <p>Votre souscription aux services de l'UNAF est maintenant <strong style="color: #16a34a;">active</strong>.</p>
                <p>Votre attestation d'adhésion est disponible dans votre espace personnel.</p>
                
                <p>Vous pouvez consulter vos services à tout moment depuis votre espace personnel.</p>
                
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                
                <p style="color: #6B7280; font-size: 12px;">
                  Merci de votre confiance,<br>
                  Le Syndicat Apicole de La Réunion
                </p>
              </div>
            `;
          } else {
            // Email pour le service miellerie
            emailContent = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #10B981;">✅ Paiement confirmé - ${service.nom}</h2>
                
                <p>Bonjour ${service.user.prenom} ${service.user.nom},</p>
                
                <p>Nous avons bien reçu votre paiement de <strong>${service.paiement.montant.toFixed(2)} €</strong> pour le droit d'usage des services de la miellerie.</p>
                
                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Service :</strong> ${service.nom}</p>
                  <p style="margin: 5px 0;"><strong>Année :</strong> ${service.annee}</p>
                  <p style="margin: 5px 0;"><strong>Date de paiement :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
                </div>
                
                ${service.caution?.status === 'recu' ? `
                  <p>Votre accès aux services de la miellerie est maintenant <strong style="color: #10B981;">actif</strong>.</p>
                ` : `
                  <div style="background-color: #FEF3C7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
                    <h3 style="color: #92400E; margin-top: 0;">⚠️ Chèque de caution requis</h3>
                    <p style="color: #78350F; margin-bottom: 0;">
                      Pour finaliser votre inscription, n'oubliez pas de transmettre votre chèque de caution de ${service.caution?.montant || 300} € 
                      à l'ordre de l'AMAIR. Votre accès sera activé dès réception du chèque.
                    </p>
                  </div>
                `}
                
                <p>Vous pouvez consulter vos services à tout moment depuis votre espace personnel.</p>
                
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                
                <p style="color: #6B7280; font-size: 12px;">
                  Merci de votre confiance,<br>
                  L'équipe AMAIR
                </p>
              </div>
            `;
          }

          await transporter.sendMail({
            from: `"${process.env.PLATFORM_NAME}" ${process.env.SMTP_FROM_EMAIL}`,
            to: service.user.email,
            subject: `Confirmation de paiement - ${service.nom} ${service.annee}`,
            html: emailContent,
          });

          // Notifier les admins du paiement de service
          try {
            await notifyAdminsServicePayment(service);
          } catch (notifError) {
            console.error('Erreur notification admins (service):', notifError);
          }

          console.log(`✅ Paiement confirmé pour le service ${service._id}`);
        }
        
        return res.json({ received: true });
      }

      // Traitement du paiement de modification de service UNAF
      if (session.metadata.type === 'service_modification') {
        const service = await Service.findById(session.metadata.serviceId).populate(
          'user',
          'prenom nom email'
        );

        if (service) {
          const historiqueEntryIndex = parseInt(session.metadata.historiqueEntryIndex);
          const historiqueEntry = service.historiqueModifications[historiqueEntryIndex];

          if (historiqueEntry) {
            // Marquer le paiement de la modification comme payé
            historiqueEntry.paiement.status = 'paye';
            historiqueEntry.paiement.datePaiement = new Date();
            historiqueEntry.paiement.stripePaymentIntentId = session.payment_intent;
            
            // Sauvegarder le reçu Stripe sur S3
            try {
              const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
              if (paymentIntent.latest_charge) {
                const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
                if (charge.receipt_url) {
                  const receiptResult = await downloadAndUploadStripeReceipt(charge.receipt_url, session.payment_intent, 'modification');
                  historiqueEntry.paiement.receiptKey = receiptResult.key;
                  console.log(`✅ Reçu modification sauvegardé: ${receiptResult.key}`);
                }
              }
            } catch (receiptError) {
              console.error('Erreur sauvegarde reçu modification:', receiptError.message);
            }
            
            // NE PAS appliquer les modifications immédiatement
            // Elles seront appliquées lors de la validation admin (même workflow que souscriptions initiales)
            // La modification reste en attente de validation (validated: false par défaut)

            await service.save();

            // Envoyer email de confirmation de paiement (modification en attente de validation)
            const emailContent = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #16a34a;">✅ Paiement reçu - Modification Services de l'UNAF</h2>
                
                <p>Bonjour ${service.user.prenom} ${service.user.nom},</p>
                
                <p>Nous avons bien reçu votre paiement de <strong>${historiqueEntry.montantSupplementaire.toFixed(2)} €</strong> pour la modification de votre souscription aux services de l'UNAF.</p>
                
                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Service :</strong> ${service.nom}</p>
                  <p style="margin: 5px 0;"><strong>Année :</strong> ${service.annee}</p>
                  <p style="margin: 5px 0;"><strong>Date de paiement :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
                </div>
                
                <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
                  <p style="margin: 0; color: #92400E;">
                    <strong>⏳ En attente de validation</strong><br>
                    Votre modification sera validée lors du prochain export vers l'UNAF. Vous recevrez une confirmation une fois la validation effectuée.
                  </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                
                <p style="color: #6B7280; font-size: 12px;">
                  Merci de votre confiance,<br>
                  Le Syndicat Apicole de La Réunion
                </p>
              </div>
            `;

            await transporter.sendMail({
              from: `"${process.env.PLATFORM_NAME}" ${process.env.SMTP_FROM_EMAIL}`,
              to: service.user.email,
              subject: `Paiement reçu - Modification Services de l'UNAF ${service.annee}`,
              html: emailContent,
            });

            console.log(`✅ Paiement modification reçu pour le service ${service._id}, modification index ${historiqueEntryIndex} (en attente de validation)`);
          }
        }
        
        return res.json({ received: true });
      }

      // Traitement du paiement d'adhésion (code existant)
      const adhesion = await Adhesion.findById(session.metadata.adhesionId).populate(
        'user',
        'prenom nom email telephoneMobile telephone adresse dateNaissance'
      );

      if (adhesion) {
        adhesion.paiement.status = 'paye';
        adhesion.paiement.datePaiement = new Date();
        adhesion.paiement.stripePaymentIntentId = session.payment_intent;
        adhesion.status = 'actif';
        adhesion.dateValidation = new Date();
        
        // Sauvegarder le reçu Stripe sur S3
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
          if (paymentIntent.latest_charge) {
            const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
            if (charge.receipt_url) {
              const receiptResult = await downloadAndUploadStripeReceipt(charge.receipt_url, session.payment_intent, 'adhesion');
              adhesion.receiptKey = receiptResult.key;
              console.log(`✅ Reçu adhésion sauvegardé: ${receiptResult.key}`);
            }
          }
        } catch (receiptError) {
          console.error('Erreur sauvegarde reçu adhésion:', receiptError.message);
        }
        
        await adhesion.save();
        
        // Générer et uploader l'attestation d'adhésion
        try {
          const attestationResult = await generateAndUploadAttestation(adhesion);
          adhesion.attestationKey = attestationResult.key;
          adhesion.attestationUrl = attestationResult.url;
          await adhesion.save();
        } catch (attestationError) {
          console.error('Erreur génération attestation:', attestationError);
        }

        // CASCADE SAR -> AMAIR : Si adhésion SAR devient active, activer les adhésions AMAIR en attente
        if (adhesion.organisme === 'SAR') {
          const adhesionAMAIREnAttente = await Adhesion.findOne({
            user: adhesion.user._id,
            organisme: 'AMAIR',
            annee: adhesion.annee,
            status: { $in: ['en_attente', 'paiement_demande'] },
            'informationsSpecifiques.AMAIR.adherentSAR': true,
          });

          if (adhesionAMAIREnAttente) {
            adhesionAMAIREnAttente.status = 'actif';
            adhesionAMAIREnAttente.dateValidation = new Date();
            await adhesionAMAIREnAttente.save();
            console.log(`✅ Adhésion AMAIR ${adhesionAMAIREnAttente._id} activée suite à l'activation de l'adhésion SAR`);

            // Générer l'attestation pour l'adhésion AMAIR
            try {
              const attestationAMAIRCascade = await generateAndUploadAttestation(adhesionAMAIREnAttente);
              adhesionAMAIREnAttente.attestationKey = attestationAMAIRCascade.key;
              adhesionAMAIREnAttente.attestationUrl = attestationAMAIRCascade.url;
              await adhesionAMAIREnAttente.save();
            } catch (attestationError) {
              console.error('Erreur génération attestation AMAIR (cascade):', attestationError);
            }
          }
        }
        
        // Si adhésion SAR avec adhesionAMAIRGratuite, créer automatiquement l'adhésion AMAIR
        let adhesionAMAIRCreee = false;
        if (adhesion.organisme === 'SAR' && adhesion.adhesionAMAIRGratuite) {
          // Vérifier qu'il n'existe pas déjà une adhésion AMAIR pour cette année
          const existingAMAIR = await Adhesion.findOne({
            user: adhesion.user._id,
            organisme: 'AMAIR',
            annee: adhesion.annee,
          });

          if (!existingAMAIR) {
            try {
              const adhesionAMAIR = new Adhesion({
                user: adhesion.user._id,
                organisme: 'AMAIR',
                annee: adhesion.annee,
                napi: adhesion.napi,
                numeroAmexa: adhesion.numeroAmexa,
                nombreRuches: adhesion.nombreRuches,
                nombreRuchers: adhesion.nombreRuchers,
                localisation: adhesion.localisation,
                siret: adhesion.siret,
                paiement: {
                  montant: 0,
                  typePaiement: 'gratuit',
                  status: 'paye',
                  datePaiement: new Date(),
                },
                status: 'actif',
                dateValidation: new Date(),
                informationsPersonnelles: adhesion.informationsPersonnelles,
                informationsSpecifiques: {
                  AMAIR: {
                    adherentSAR: true
                  }
                },
              });
              await adhesionAMAIR.save();
              adhesionAMAIRCreee = true;
              console.log(`✅ Adhésion AMAIR gratuite créée automatiquement pour l'adhérent SAR ${adhesion.user._id}`);
              
              // Générer l'attestation pour l'adhésion AMAIR gratuite
              try {
                const attestationAMAIR = await generateAndUploadAttestation(adhesionAMAIR);
                adhesionAMAIR.attestationKey = attestationAMAIR.key;
                adhesionAMAIR.attestationUrl = attestationAMAIR.url;
                await adhesionAMAIR.save();
              } catch (attestationError) {
                console.error('Erreur génération attestation AMAIR:', attestationError);
              }
              
              // Générer le bulletin d'adhésion pour l'adhésion AMAIR gratuite
              try {
                const bulletinAMAIR = await generateAndUploadBulletinAdhesion(adhesionAMAIR);
                adhesionAMAIR.bulletinKey = bulletinAMAIR.key;
                adhesionAMAIR.bulletinUrl = bulletinAMAIR.url;
                await adhesionAMAIR.save();
                console.log('✅ Bulletin adhésion AMAIR gratuite généré');
              } catch (bulletinError) {
                console.error('Erreur génération bulletin AMAIR:', bulletinError);
              }
            } catch (error) {
              console.error('Erreur lors de la création de l\'adhésion AMAIR gratuite:', error);
            }
          }
        }
        
        // Envoyer email de confirmation à l'utilisateur
        const emailContent = adhesionAMAIRCreee ? `
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
            
            <div style="background-color: #FEF3C7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
              <h3 style="color: #92400E; margin-top: 0;">🎁 Bonus : Adhésion AMAIR gratuite</h3>
              <p style="color: #78350F; margin-bottom: 0;">
                En tant qu'adhérent SAR, vous bénéficiez automatiquement d'une adhésion gratuite à l'AMAIR 
                (Association de la Maison de l'Apiculture de la Réunion) pour l'année ${adhesion.annee} (valeur 50€).
              </p>
            </div>
            
            <p>Vous pouvez consulter vos adhésions à tout moment depuis votre espace personnel.</p>
            
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
            
            <p style="color: #6B7280; font-size: 12px;">
              Merci de votre confiance,<br>
              L'équipe ${adhesion.organisme}
            </p>
          </div>
        ` : `
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
        `;
        
        await transporter.sendMail({
          from: `"${process.env.PLATFORM_NAME}" ${process.env.SMTP_FROM_EMAIL}`,
          to: adhesion.user.email,
          subject: `Confirmation de paiement - Adhésion ${adhesion.organisme} ${adhesion.annee}`,
          html: emailContent,
        });

        // Notifier les admins du paiement d'adhésion
        try {
          await notifyAdminsAdhesionPayment(adhesion);
        } catch (notifError) {
          console.error('Erreur notification admins (adhésion):', notifError);
        }

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

  // Préparer le lien de paiement
  const paymentUrl = `${process.env.FRONTEND_URL}/reglement-adhesion/${adhesionId}`;

  // Envoyer d'abord l'email - ne mettre à jour le statut que si l'envoi réussit
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

    // Email envoyé avec succès - maintenant mettre à jour le statut
    adhesion.status = 'paiement_demande';
    adhesion.paiement.status = 'demande';
    adhesion.paiement.dateEnvoiLien = new Date();
    await adhesion.save();

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
    throw new Error('Erreur lors de l\'envoi de la demande de paiement. Le statut n\'a pas été modifié.');
  }
});

// @desc    Créer une session de paiement Stripe pour un service
// @route   POST /api/payment/service/create-payment-session/:serviceId
// @access  Private
const createServicePaymentSession = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;

  const service = await Service.findById(serviceId)
    .populate('user', 'prenom nom email')
    .populate('adhesion', 'organisme annee');

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  // Vérifier que l'utilisateur est propriétaire
  if (service.user._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Vérifier que le paiement n'a pas déjà été effectué
  if (service.paiement.status === 'paye') {
    res.status(400);
    throw new Error('Ce service a déjà été payé');
  }

  // Déterminer le compte de destination selon le type de service
  let destinationAccount;
  let serviceDescription;

  if (service.typeService === 'miellerie') {
    destinationAccount = process.env.STRIPE_ACCOUNT_AMAIR;
    serviceDescription = `Droit d'usage annuel pour les services de la miellerie AMAIR`;
    if (!destinationAccount) {
      console.warn('⚠️  Compte Stripe AMAIR non configuré. Le paiement ira sur le compte principal.');
    }
  } else if (service.typeService === 'assurance_unaf') {
    destinationAccount = process.env.STRIPE_ACCOUNT_SAR;
    serviceDescription = `Services de l'UNAF via le Syndicat Apicole de La Réunion`;
    if (!destinationAccount) {
      console.warn('⚠️  Compte Stripe SAR non configuré. Le paiement ira sur le compte principal.');
    }
  }

  try {
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${service.nom} - ${service.annee}`,
              description: serviceDescription,
            },
            unit_amount: Math.round(service.paiement.montant * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      locale: 'fr',
      success_url: `${process.env.FRONTEND_URL}/dashboard?service_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard?service_canceled=true`,
      customer_email: service.user.email,
      metadata: {
        serviceId: service._id.toString(),
        userId: service.user._id.toString(),
        typeService: service.typeService,
        type: 'service', // Pour différencier dans le webhook
      },
    };

    // Ajouter les données du payment_intent (receipt_email + transfert si applicable)
    sessionConfig.payment_intent_data = {
      receipt_email: service.user.email,
      metadata: {
        serviceId: service._id.toString(),
        userId: service.user._id.toString(),
        typeService: service.typeService,
        userEmail: service.user.email,
      },
    };

    // Ajouter le transfert automatique si un compte de destination est configuré
    if (destinationAccount) {
      sessionConfig.payment_intent_data.application_fee_amount = 0;
      sessionConfig.payment_intent_data.transfer_data = {
        destination: destinationAccount,
      };
      console.log(`💸 Paiement service configuré pour transfert vers ${service.typeService === 'miellerie' ? 'AMAIR' : 'SAR'} (${destinationAccount})`);
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Enregistrer l'ID de session dans le service
    await Service.updateOne(
      { _id: serviceId },
      {
        $set: {
          'paiement.stripeSessionId': session.id,
          'paiement.status': 'en_attente',
        },
      }
    );

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Erreur création session Stripe service:', error);
    res.status(500);
    throw new Error(`Erreur Stripe: ${error.message || 'Erreur lors de la création de la session de paiement'}`);
  }
});

// @desc    Marquer un paiement de service comme effectué manuellement (admin)
// @route   POST /api/payment/service/mark-paid/:serviceId
// @access  Private/Admin
const markServicePaymentAsPaid = asyncHandler(async (req, res) => {
  // Vérifier les permissions
  if (req.user?.role !== 'super_admin') {
    const permissions = await Permission.findOne({ userId: req.user._id });
    if (!permissions?.adhesions?.changeAdherentStatus) {
      res.status(403);
      throw new Error('Accès refusé - Permission insuffisante');
    }
  }

  const { serviceId } = req.params;
  const { typePaiement, datePaiement, note } = req.body;

  if (!typePaiement || !['cheque', 'en_ligne'].includes(typePaiement)) {
    res.status(400);
    throw new Error('Mode de paiement invalide (cheque ou en_ligne)');
  }

  if (!datePaiement) {
    res.status(400);
    throw new Error('La date de paiement est requise');
  }

  const service = await Service.findById(serviceId).populate('user', 'type prenom nom email adresse telephoneMobile telephone designation raisonSociale');

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  if (service.paiement?.status === 'paye') {
    res.status(400);
    throw new Error('Ce service est déjà marqué comme payé');
  }

  service.paiement.status = 'paye';
  service.paiement.typePaiement = typePaiement;
  service.paiement.datePaiement = new Date(datePaiement);
  if (note) service.paiement.note = note;

  // Gérer l'upload du document de paiement si fourni
  if (req.file) {
    try {
      const fileName = `preuve_paiement_service_${service._id}_${Date.now()}${require('path').extname(req.file.originalname)}`;
      const s3Result = await uploadFile(
        req.file.buffer,
        fileName,
        req.file.mimetype,
        `services/${service._id}/documents-paiement`
      );

      service.documentPaiement = {
        nom: req.file.originalname,
        key: s3Result.key,
        url: s3Result.url,
        dateUpload: new Date(),
        uploadePar: req.user._id
      };
      console.log(`📎 Document de paiement uploadé pour le service ${service._id}`);
    } catch (uploadError) {
      console.error('Erreur upload document paiement service:', uploadError);
      // Ne pas bloquer le processus si l'upload échoue
    }
  }

  // Mettre à jour le statut global
  // Pour UNAF: attendre validation admin après export
  // Pour miellerie: activer si caution reçue, sinon attendre caution
  if (service.typeService === 'assurance_unaf') {
    service.status = 'en_attente_validation';
  } else if (service.caution?.status === 'recu') {
    service.status = 'actif';
    service.dateValidation = new Date();
  } else {
    service.status = 'en_attente_caution';
  }

  await service.save();

  // Générer l'attestation si le service est actif
  if (service.status === 'actif') {
    try {
      const { generateAndUploadServiceAttestation, generateAndUploadEcocontributionAttestation } = require('../services/pdfService');
      const attestationResult = await generateAndUploadServiceAttestation(service);
      service.attestationKey = attestationResult.key;
      service.attestationUrl = attestationResult.url;
      
      // Si c'est un service UNAF avec écocontribution, générer l'attestation écocontribution
      if (service.typeService === 'assurance_unaf' && service.unafData?.options?.ecocontribution?.souscrit) {
        try {
          const ecoResult = await generateAndUploadEcocontributionAttestation(service);
          service.ecocontributionAttestationKey = ecoResult.key;
          service.ecocontributionAttestationUrl = ecoResult.url;
          console.log('Attestation écocontribution générée:', ecoResult.fileName);
        } catch (ecoError) {
          console.error('Erreur génération attestation écocontribution:', ecoError);
        }
      }
      
      await service.save();
    } catch (attestationError) {
      console.error('Erreur génération attestation service:', attestationError);
    }
  }

  res.json({
    success: true,
    service,
  });
});

// @desc    Récupérer les infos d'un service pour le paiement
// @route   GET /api/payment/service/:serviceId
// @access  Private
const getServiceForPayment = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;

  const service = await Service.findById(serviceId)
    .populate('user', 'prenom nom email')
    .populate('adhesion', 'organisme annee');

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  // Vérifier que l'utilisateur est propriétaire
  if (service.user._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  res.json({
    _id: service._id,
    nom: service.nom,
    typeService: service.typeService,
    annee: service.annee,
    montant: service.paiement.montant,
    status: service.paiement.status,
    typePaiement: service.paiement.typePaiement,
    caution: service.caution,
    user: {
      prenom: service.user.prenom,
      nom: service.user.nom,
      email: service.user.email,
    },
  });
});

// @desc    Récupérer tous les paiements en attente (adhésions + services)
// @route   GET /api/payment/pending
// @access  Private/Admin
const getPendingPayments = asyncHandler(async (req, res) => {
  const { annee, type } = req.query;
  const currentYear = annee ? parseInt(annee) : new Date().getFullYear();

  // Filtrer par organisme selon les droits de l'admin
  let organismeFilter = {};
  if (req.user.role !== 'super_admin') {
    const userOrganismes = req.user.organismes || [req.user.organisme];
    organismeFilter = { organisme: { $in: userOrganismes } };
  }

  // Récupérer les adhésions en attente de paiement
  let adhesionsEnAttente = [];
  if (!type || type === 'adhesion') {
    adhesionsEnAttente = await Adhesion.find({
      annee: currentYear,
      'paiement.status': { $in: ['non_demande', 'demande'] },
      ...organismeFilter,
    })
      .populate('user', 'prenom nom email telephone')
      .select('user organisme annee paiement status createdAt')
      .sort({ createdAt: -1 });
  }

  // Récupérer les services en attente de paiement
  let servicesEnAttente = [];
  if (!type || type === 'service') {
    const Service = require('../models/serviceModel');
    servicesEnAttente = await Service.find({
      annee: currentYear,
      'paiement.status': 'en_attente', // Service utilise 'en_attente' et non 'non_demande'/'demande'
      ...organismeFilter,
    })
      .populate('user', 'prenom nom email telephone')
      .populate('adhesion', 'organisme')
      .select('user adhesion nom typeService organisme annee paiement caution status createdAt')
      .sort({ createdAt: -1 });
  }

  // Récupérer les paiements récemment effectués (30 derniers jours)
  let paiementsRecents = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (!type || type === 'adhesion') {
    const adhesionsPayees = await Adhesion.find({
      annee: currentYear,
      'paiement.status': 'paye',
      'paiement.datePaiement': { $gte: thirtyDaysAgo },
      ...organismeFilter,
    })
      .populate('user', 'prenom nom email')
      .select('user organisme annee paiement status')
      .sort({ 'paiement.datePaiement': -1 })
      .limit(20);

    paiementsRecents.push(...adhesionsPayees.map(a => ({
      _id: a._id,
      type: 'adhesion',
      user: a.user,
      organisme: a.organisme,
      annee: a.annee,
      montant: a.paiement.montant,
      typePaiement: a.paiement.typePaiement,
      datePaiement: a.paiement.datePaiement,
    })));
  }

  if (!type || type === 'service') {
    const Service = require('../models/serviceModel');
    const servicesPayes = await Service.find({
      annee: currentYear,
      'paiement.status': 'paye',
      'paiement.datePaiement': { $gte: thirtyDaysAgo },
      ...organismeFilter,
    })
      .populate('user', 'prenom nom email')
      .select('user organisme nom typeService annee paiement')
      .sort({ 'paiement.datePaiement': -1 })
      .limit(20);

    paiementsRecents.push(...servicesPayes.map(s => ({
      _id: s._id,
      type: 'service',
      nom: s.nom,
      typeService: s.typeService,
      user: s.user,
      organisme: s.organisme,
      annee: s.annee,
      montant: s.paiement.montant,
      typePaiement: s.paiement.typePaiement,
      datePaiement: s.paiement.datePaiement,
    })));
  }

  // Trier les paiements récents par date
  paiementsRecents.sort((a, b) => new Date(b.datePaiement) - new Date(a.datePaiement));

  res.json({
    annee: currentYear,
    adhesionsEnAttente: adhesionsEnAttente.map(a => ({
      _id: a._id,
      type: 'adhesion',
      user: a.user,
      organisme: a.organisme,
      annee: a.annee,
      montant: a.paiement.montant,
      status: a.paiement.status,
      dateEnvoiLien: a.paiement.dateEnvoiLien,
      createdAt: a.createdAt,
    })),
    servicesEnAttente: servicesEnAttente.map(s => ({
      _id: s._id,
      type: 'service',
      nom: s.nom,
      typeService: s.typeService,
      user: s.user,
      organisme: s.organisme,
      annee: s.annee,
      montant: s.paiement.montant,
      status: s.paiement.status,
      cautionStatus: s.caution?.status,
      createdAt: s.createdAt,
    })),
    paiementsRecents: paiementsRecents.slice(0, 20),
    stats: {
      totalAdhesionsEnAttente: adhesionsEnAttente.length,
      totalServicesEnAttente: servicesEnAttente.length,
      montantAdhesionsEnAttente: adhesionsEnAttente.reduce((sum, a) => sum + (a.paiement.montant || 0), 0),
      montantServicesEnAttente: servicesEnAttente.reduce((sum, s) => sum + (s.paiement.montant || 0), 0),
    },
  });
});

// @desc    Créer une session de paiement Stripe pour une modification UNAF
// @route   POST /api/payment/service-modification/:serviceId/create-session
// @access  Private
const createUNAFModificationPaymentSession = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { historiqueEntryIndex } = req.body;

  const service = await Service.findById(serviceId)
    .populate('user', 'prenom nom email');

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  if (service.user._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  const historiqueEntry = service.historiqueModifications[historiqueEntryIndex];
  if (!historiqueEntry) {
    res.status(404);
    throw new Error('Modification non trouvée');
  }

  if (historiqueEntry.paiement.status === 'paye') {
    res.status(400);
    throw new Error('Cette modification a déjà été payée');
  }

  const montant = historiqueEntry.montantSupplementaire;

  // Compte Stripe SAR pour UNAF
  const destinationAccount = process.env.STRIPE_ACCOUNT_SAR;

  try {
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Modification services de l'UNAF - ${service.annee}`,
              description: `Supplément pour modification de votre souscription UNAF`,
            },
            unit_amount: Math.round(montant * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      locale: 'fr',
      success_url: `${process.env.FRONTEND_URL}/service/${serviceId}?modification_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/service/${serviceId}?modification_canceled=true`,
      customer_email: service.user.email,
      metadata: {
        serviceId: service._id.toString(),
        userId: service.user._id.toString(),
        historiqueEntryIndex: historiqueEntryIndex.toString(),
        type: 'service_modification',
      },
    };

    // Ajouter les données du payment_intent (receipt_email + transfert si applicable)
    sessionConfig.payment_intent_data = {
      receipt_email: service.user.email,
      metadata: {
        serviceId: service._id.toString(),
        userId: service.user._id.toString(),
        historiqueEntryIndex: historiqueEntryIndex.toString(),
        userEmail: service.user.email,
      },
    };

    if (destinationAccount) {
      sessionConfig.payment_intent_data.application_fee_amount = 0;
      sessionConfig.payment_intent_data.transfer_data = {
        destination: destinationAccount,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Enregistrer l'ID de session dans l'historique
    service.historiqueModifications[historiqueEntryIndex].paiement.stripeSessionId = session.id;
    await service.save();

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Erreur création session Stripe modification:', error);
    res.status(500);
    throw new Error(`Erreur Stripe: ${error.message}`);
  }
});

module.exports = {
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
};
