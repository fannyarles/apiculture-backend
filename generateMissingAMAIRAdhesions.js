require('dotenv').config();

const mongoose = require('mongoose');
const Adhesion = require('./models/adhesionModel');
const User = require('./models/userModel');
const { generateAndUploadAttestation, generateAndUploadBulletinAdhesion } = require('./services/pdfService');

/**
 * Script pour générer automatiquement les adhésions AMAIR gratuites
 * pour les adhérents SAR ayant adhesionAMAIRGratuite = true
 * mais n'ayant pas encore d'adhésion AMAIR pour l'année en cours
 */

async function generateMissingAMAIRAdhesions() {
  try {
    console.log('🔄 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');

    // Récupérer toutes les adhésions SAR avec adhesionAMAIRGratuite = true
    console.log('\n🔍 Recherche des adhésions SAR avec adhesionAMAIRGratuite...');
    const adhesionsSAR = await Adhesion.find({
      organisme: 'SAR',
      adhesionAMAIRGratuite: true,
      'paiement.status': 'paye',
      status: 'actif'
    }).populate('user', 'prenom nom email');

    console.log(`📊 ${adhesionsSAR.length} adhésion(s) SAR trouvée(s) avec adhesionAMAIRGratuite`);

    const results = {
      created: 0,
      alreadyExists: 0,
      errors: [],
      details: []
    };

    // Pour chaque adhésion SAR, vérifier et créer l'adhésion AMAIR si nécessaire
    for (const adhesionSAR of adhesionsSAR) {
      try {
        console.log(`\n👤 ${adhesionSAR.user.prenom} ${adhesionSAR.user.nom} - Année ${adhesionSAR.annee}`);

        // Vérifier si l'adhésion AMAIR existe déjà
        const existingAMAIR = await Adhesion.findOne({
          user: adhesionSAR.user._id,
          organisme: 'AMAIR',
          annee: adhesionSAR.annee
        });

        if (existingAMAIR) {
          console.log(`   ⏭️  Adhésion AMAIR ${adhesionSAR.annee} existe déjà`);
          results.alreadyExists++;
          continue;
        }

        console.log(`   ✨ Création de l'adhésion AMAIR gratuite...`);

        // Créer l'adhésion AMAIR
        const adhesionAMAIR = new Adhesion({
          user: adhesionSAR.user._id,
          organisme: 'AMAIR',
          annee: adhesionSAR.annee,
          napi: adhesionSAR.napi,
          numeroAmexa: adhesionSAR.numeroAmexa,
          nombreRuches: adhesionSAR.nombreRuches,
          nombreRuchers: adhesionSAR.nombreRuchers,
          localisation: adhesionSAR.localisation,
          siret: adhesionSAR.siret,
          paiement: {
            montant: 0,
            typePaiement: 'gratuit',
            status: 'paye',
            datePaiement: new Date(),
          },
          status: 'actif',
          dateValidation: new Date(),
          informationsPersonnelles: adhesionSAR.informationsPersonnelles,
          informationsSpecifiques: {
            AMAIR: {
              adherentSAR: true,
            },
          },
          signature: adhesionSAR.signature,
        });

        await adhesionAMAIR.save();
        console.log(`   ✅ Adhésion AMAIR créée: ${adhesionAMAIR._id}`);

        // Générer l'attestation
        try {
          const attestationResult = await generateAndUploadAttestation(adhesionAMAIR);
          adhesionAMAIR.attestationKey = attestationResult.key;
          adhesionAMAIR.attestationUrl = attestationResult.url;
          console.log(`   ✅ Attestation générée`);
        } catch (attestationError) {
          console.error(`   ⚠️  Erreur génération attestation: ${attestationError.message}`);
        }

        // Générer le bulletin
        try {
          const bulletinResult = await generateAndUploadBulletinAdhesion(adhesionAMAIR);
          adhesionAMAIR.bulletinKey = bulletinResult.key;
          adhesionAMAIR.bulletinUrl = bulletinResult.url;
          console.log(`   ✅ Bulletin généré`);
        } catch (bulletinError) {
          console.error(`   ⚠️  Erreur génération bulletin: ${bulletinError.message}`);
        }

        await adhesionAMAIR.save();

        results.created++;
        results.details.push({
          user: `${adhesionSAR.user.prenom} ${adhesionSAR.user.nom}`,
          email: adhesionSAR.user.email,
          annee: adhesionSAR.annee,
          adhesionAMAIRId: adhesionAMAIR._id
        });

      } catch (error) {
        console.error(`   ❌ Erreur pour ${adhesionSAR.user.prenom} ${adhesionSAR.user.nom}:`, error.message);
        results.errors.push({
          user: `${adhesionSAR.user.prenom} ${adhesionSAR.user.nom}`,
          adhesionSARId: adhesionSAR._id,
          annee: adhesionSAR.annee,
          error: error.message
        });
      }
    }

    // Afficher le résumé
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ DU TRAITEMENT');
    console.log('='.repeat(60));
    console.log(`✅ Adhésions AMAIR créées: ${results.created}`);
    console.log(`⏭️  Déjà existantes: ${results.alreadyExists}`);
    console.log(`❌ Erreurs: ${results.errors.length}`);

    if (results.details.length > 0) {
      console.log('\n📋 DÉTAILS DES ADHÉSIONS AMAIR CRÉÉES:');
      results.details.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.user}`);
        console.log(`   Email: ${item.email}`);
        console.log(`   Année: ${item.annee}`);
        console.log(`   ID AMAIR: ${item.adhesionAMAIRId}`);
      });
    }

    if (results.errors.length > 0) {
      console.log('\n❌ ERREURS:');
      results.errors.forEach((err, index) => {
        console.log(`\n${index + 1}. ${err.user}`);
        console.log(`   Adhésion SAR ID: ${err.adhesionSARId}`);
        console.log(`   Année: ${err.annee}`);
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
console.log('🚀 Démarrage du script de génération des adhésions AMAIR gratuites...\n');
generateMissingAMAIRAdhesions();
