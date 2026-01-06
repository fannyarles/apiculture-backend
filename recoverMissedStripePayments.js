require('dotenv').config();

const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const Adhesion = require('./models/adhesionModel');
const Service = require('./models/serviceModel');
const User = require('./models/userModel');
const { generateAndUploadAttestation, generateAndUploadBulletinAdhesion, generateAndUploadServiceAttestation, generateAndUploadEcocontributionAttestation } = require('./services/pdfService');
const { notifyAdminsAdhesionPayment, notifyAdminsServicePayment } = require('./services/adminNotificationService');

/**
 * Script de récupération des paiements Stripe manqués
 * À exécuter une seule fois pour traiter les sessions checkout.session.completed
 * qui n'ont pas été traitées à cause d'un webhook désactivé
 */

async function recoverMissedPayments() {
  try {
    console.log('🔄 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');

    // Récupérer les sessions des 30 derniers jours
    console.log('\n🔍 Récupération des sessions Stripe des 30 derniers jours...');
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    let allSessions = [];
    let hasMore = true;
    let startingAfter = null;

    // Pagination pour récupérer toutes les sessions
    while (hasMore) {
      const params = {
        limit: 100,
        created: { gte: thirtyDaysAgo },
        expand: ['data.payment_intent']
      };
      
      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const sessions = await stripe.checkout.sessions.list(params);
      allSessions = allSessions.concat(sessions.data);
      
      hasMore = sessions.has_more;
      if (hasMore && sessions.data.length > 0) {
        startingAfter = sessions.data[sessions.data.length - 1].id;
      }
    }

    console.log(`📊 ${allSessions.length} sessions trouvées au total`);

    const results = {
      adhesionsProcessed: 0,
      servicesProcessed: 0,
      alreadyProcessed: 0,
      skipped: 0,
      errors: [],
      processed: []
    };

    // Traiter chaque session
    for (const session of allSessions) {
      console.log(`\n🔍 Session: ${session.id}`);
      console.log(`   Payment status: ${session.payment_status}`);
      console.log(`   Metadata:`, session.metadata);
      
      // Ignorer les sessions non payées
      if (session.payment_status !== 'paid') {
        console.log(`   ⏭️  Ignorée (non payée)`);
        results.skipped++;
        continue;
      }

      const metadata = session.metadata;
      
      // Si pas de type mais adhesionId présent, c'est une adhésion
      const isAdhesion = metadata.type === 'adhesion' || (metadata.adhesionId && !metadata.serviceId);
      const isService = metadata.type === 'service' || metadata.serviceId;
      
      if (!isAdhesion && !isService) {
        console.log(`   ⏭️  Ignorée (pas de metadata valide)`);
        results.skipped++;
        continue;
      }
      
      try {
        // Traitement des adhésions
        if (isAdhesion) {
          const adhesionId = metadata.adhesionId;
          
          // Vérifier si déjà traité
          const adhesion = await Adhesion.findById(adhesionId).populate('user', 'prenom nom email telephoneMobile telephone adresse dateNaissance designation typePersonne raisonSociale');
          
          if (!adhesion) {
            results.errors.push({
              sessionId: session.id,
              type: 'adhesion',
              error: 'Adhésion non trouvée',
              adhesionId
            });
            continue;
          }

          // Si déjà payé, ignorer
          if (adhesion.paiement?.status === 'paye' && adhesion.paiement?.stripeSessionId === session.id) {
            results.alreadyProcessed++;
            continue;
          }

          // Si payé mais avec un autre session ID, c'est suspect
          if (adhesion.paiement?.status === 'paye' && adhesion.paiement?.stripeSessionId !== session.id) {
            console.log(`⚠️  Adhésion ${adhesionId} déjà payée avec une autre session`);
            results.alreadyProcessed++;
            continue;
          }

          console.log(`\n💳 Traitement adhésion: ${adhesionId}`);
          console.log(`   Session: ${session.id}`);
          console.log(`   User: ${adhesion.user.prenom} ${adhesion.user.nom}`);

          // Mettre à jour le paiement
          adhesion.paiement.status = 'paye';
          adhesion.paiement.datePaiement = new Date(session.created * 1000);
          adhesion.paiement.stripePaymentIntentId = session.payment_intent;
          adhesion.paiement.stripeSessionId = session.id;
          adhesion.status = 'actif';
          adhesion.dateValidation = new Date(session.created * 1000);

          // Récupérer le reçu Stripe
          try {
            const charge = await stripe.charges.retrieve(session.payment_intent, {
              expand: ['payment_intent']
            }).catch(() => null);
            
            let receiptUrl = charge?.receipt_url;
            if (!receiptUrl) {
              const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
              if (paymentIntent.latest_charge) {
                const chargeFromPI = await stripe.charges.retrieve(paymentIntent.latest_charge);
                receiptUrl = chargeFromPI.receipt_url;
              }
            }
            
            if (receiptUrl) {
              adhesion.receiptUrl = receiptUrl;
              console.log(`   ✅ Reçu URL: ${receiptUrl}`);
            }
          } catch (receiptError) {
            console.error(`   ⚠️  Erreur récupération reçu: ${receiptError.message}`);
          }

          await adhesion.save();

          // Générer l'attestation et le bulletin
          try {
            const attestationResult = await generateAndUploadAttestation(adhesion);
            adhesion.attestationKey = attestationResult.key;
            adhesion.attestationUrl = attestationResult.url;
            
            const bulletinResult = await generateAndUploadBulletinAdhesion(adhesion);
            adhesion.bulletinKey = bulletinResult.key;
            adhesion.bulletinUrl = bulletinResult.url;
            
            await adhesion.save();
            console.log(`   ✅ Attestation et bulletin générés`);
          } catch (pdfError) {
            console.error(`   ⚠️  Erreur génération PDF: ${pdfError.message}`);
          }

          // Notifier les admins
          try {
            await notifyAdminsAdhesionPayment(adhesion);
            console.log(`   ✅ Admins notifiés`);
          } catch (notifError) {
            console.error(`   ⚠️  Erreur notification admins: ${notifError.message}`);
          }

          results.adhesionsProcessed++;
          results.processed.push({
            type: 'adhesion',
            id: adhesionId,
            sessionId: session.id,
            user: `${adhesion.user.prenom} ${adhesion.user.nom}`,
            montant: adhesion.paiement.montant
          });

        } 
        // Traitement des services
        else if (isService) {
          const serviceId = metadata.serviceId;
          
          const service = await Service.findById(serviceId).populate(
            'user',
            'type prenom nom email adresse telephoneMobile telephone designation raisonSociale typePersonne'
          );
          
          if (!service) {
            results.errors.push({
              sessionId: session.id,
              type: 'service',
              error: 'Service non trouvé',
              serviceId
            });
            continue;
          }

          // Si déjà payé, ignorer
          if (service.paiement?.status === 'paye' && service.paiement?.stripePaymentIntentId === session.payment_intent) {
            results.alreadyProcessed++;
            continue;
          }

          console.log(`\n💳 Traitement service: ${serviceId}`);
          console.log(`   Session: ${session.id}`);
          console.log(`   User: ${service.user.prenom} ${service.user.nom}`);
          console.log(`   Type: ${service.typeService}`);

          // Mettre à jour le paiement
          service.paiement.status = 'paye';
          service.paiement.datePaiement = new Date(session.created * 1000);
          service.paiement.stripePaymentIntentId = session.payment_intent;

          // Mettre à jour le statut global
          if (service.typeService === 'assurance_unaf') {
            service.status = 'en_attente_validation';
          } else if (service.caution?.status === 'recu') {
            service.status = 'actif';
            service.dateValidation = new Date(session.created * 1000);
          } else {
            service.status = 'en_attente_caution';
          }

          // Récupérer le reçu Stripe
          try {
            const charge = await stripe.charges.retrieve(session.payment_intent, {
              expand: ['payment_intent']
            }).catch(() => null);
            
            let receiptUrl = charge?.receipt_url;
            if (!receiptUrl) {
              const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
              if (paymentIntent.latest_charge) {
                const chargeFromPI = await stripe.charges.retrieve(paymentIntent.latest_charge);
                receiptUrl = chargeFromPI.receipt_url;
              }
            }
            
            if (receiptUrl) {
              service.receiptUrl = receiptUrl;
              console.log(`   ✅ Reçu URL: ${receiptUrl}`);
            }
          } catch (receiptError) {
            console.error(`   ⚠️  Erreur récupération reçu: ${receiptError.message}`);
          }

          await service.save();

          // Générer l'attestation si le service est actif
          if (service.status === 'actif') {
            try {
              const attestationResult = await generateAndUploadServiceAttestation(service);
              service.attestationKey = attestationResult.key;
              service.attestationUrl = attestationResult.url;
              
              // Si c'est un service UNAF avec écocontribution
              if (service.typeService === 'assurance_unaf' && service.unafData?.options?.ecocontribution?.souscrit) {
                try {
                  const ecoResult = await generateAndUploadEcocontributionAttestation(service);
                  service.ecocontributionAttestationKey = ecoResult.key;
                  service.ecocontributionAttestationUrl = ecoResult.url;
                  console.log(`   ✅ Attestation écocontribution générée`);
                } catch (ecoError) {
                  console.error(`   ⚠️  Erreur attestation écocontribution: ${ecoError.message}`);
                }
              }
              
              await service.save();
              console.log(`   ✅ Attestation générée`);
            } catch (attestationError) {
              console.error(`   ⚠️  Erreur génération attestation: ${attestationError.message}`);
            }
          }

          // Notifier les admins
          try {
            await notifyAdminsServicePayment(service);
            console.log(`   ✅ Admins notifiés`);
          } catch (notifError) {
            console.error(`   ⚠️  Erreur notification admins: ${notifError.message}`);
          }

          results.servicesProcessed++;
          results.processed.push({
            type: 'service',
            id: serviceId,
            sessionId: session.id,
            user: `${service.user.prenom} ${service.user.nom}`,
            montant: service.paiement.montant,
            typeService: service.typeService
          });
        }

      } catch (error) {
        console.error(`❌ Erreur traitement session ${session.id}:`, error.message);
        results.errors.push({
          sessionId: session.id,
          type: metadata.type,
          error: error.message,
          id: metadata.adhesionId || metadata.serviceId
        });
      }
    }

    // Afficher le résumé
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ DU TRAITEMENT');
    console.log('='.repeat(60));
    console.log(`✅ Adhésions traitées: ${results.adhesionsProcessed}`);
    console.log(`✅ Services traités: ${results.servicesProcessed}`);
    console.log(`⏭️  Déjà traités: ${results.alreadyProcessed}`);
    console.log(`⏭️  Ignorées (non payées ou sans metadata): ${results.skipped}`);
    console.log(`❌ Erreurs: ${results.errors.length}`);
    
    if (results.processed.length > 0) {
      console.log('\n📋 DÉTAILS DES PAIEMENTS TRAITÉS:');
      results.processed.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.type.toUpperCase()}`);
        console.log(`   ID: ${item.id}`);
        console.log(`   Session: ${item.sessionId}`);
        console.log(`   User: ${item.user}`);
        console.log(`   Montant: ${item.montant} €`);
        if (item.typeService) {
          console.log(`   Type service: ${item.typeService}`);
        }
      });
    }

    if (results.errors.length > 0) {
      console.log('\n❌ ERREURS:');
      results.errors.forEach((err, index) => {
        console.log(`\n${index + 1}. Session: ${err.sessionId}`);
        console.log(`   Type: ${err.type}`);
        console.log(`   ID: ${err.id}`);
        console.log(`   Erreur: ${err.error}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Script terminé');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Déconnecté de MongoDB');
    process.exit(0);
  }
}

// Exécuter le script
console.log('🚀 Démarrage du script de récupération des paiements Stripe manqués...\n');
recoverMissedPayments();
