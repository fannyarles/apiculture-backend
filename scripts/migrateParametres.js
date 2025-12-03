/**
 * Script de migration des paramètres
 * Convertit l'ancien format (un document par année) 
 * vers le nouveau format (un document par organisme ET par année)
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Parametre = require('../models/parametreModel');

// Charger les variables d'environnement
dotenv.config({ path: '../.env' });

// Ancien modèle (pour référence)
const OldParametreSchema = new mongoose.Schema({
  annee: Number,
  tarifsSAR: {
    loisir: Number,
    professionnel: Number
  },
  tarifsAMAIR: {
    loisir: Number,
    professionnel: Number
  },
  adhesionsOuvertes: Boolean,
  isActive: Boolean
});

const OldParametre = mongoose.model('OldParametre', OldParametreSchema, 'parametres');

const migrateParametres = async () => {
  try {
    console.log('🔄 Début de la migration des paramètres...\n');

    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Récupérer tous les anciens paramètres
    const oldParametres = await OldParametre.find({});
    console.log(`📊 ${oldParametres.length} ancien(s) paramètre(s) trouvé(s)\n`);

    if (oldParametres.length === 0) {
      console.log('ℹ️  Aucun ancien paramètre à migrer');
      console.log('🆕 Création des paramètres pour l\'année en cours...\n');
      
      const currentYear = new Date().getFullYear();
      
      // Créer SAR
      const sar = await Parametre.create({
        organisme: 'SAR',
        annee: currentYear,
        tarifs: {
          loisir: 30,
          professionnel: 50
        },
        adhesionsOuvertes: true,
        estAnneeEnCours: true
      });
      console.log(`✅ Créé: SAR ${currentYear}`);
      
      // Créer AMAIR
      const amair = await Parametre.create({
        organisme: 'AMAIR',
        annee: currentYear,
        tarifs: {
          loisir: 25,
          professionnel: 45
        },
        adhesionsOuvertes: true,
        estAnneeEnCours: true
      });
      console.log(`✅ Créé: AMAIR ${currentYear}`);
      
      console.log('\n🎉 Paramètres initiaux créés avec succès !');
      process.exit(0);
    }

    const currentYear = new Date().getFullYear();
    let migratedCount = 0;
    let skippedCount = 0;

    for (const oldParam of oldParametres) {
      console.log(`\n📝 Migration de l'année ${oldParam.annee}...`);

      const estAnneeEnCours = oldParam.annee === currentYear;

      // Créer le paramètre SAR
      try {
        const existingSAR = await Parametre.findOne({ 
          organisme: 'SAR', 
          annee: oldParam.annee 
        });

        if (existingSAR) {
          console.log(`  ⏭️  SAR ${oldParam.annee} existe déjà, ignoré`);
          skippedCount++;
        } else {
          await Parametre.create({
            organisme: 'SAR',
            annee: oldParam.annee,
            tarifs: oldParam.tarifsSAR || { loisir: 30, professionnel: 50 },
            adhesionsOuvertes: estAnneeEnCours ? true : (oldParam.adhesionsOuvertes || false),
            estAnneeEnCours: estAnneeEnCours
          });
          console.log(`  ✅ SAR ${oldParam.annee} créé`);
          migratedCount++;
        }
      } catch (error) {
        console.error(`  ❌ Erreur SAR ${oldParam.annee}:`, error.message);
      }

      // Créer le paramètre AMAIR
      try {
        const existingAMAIR = await Parametre.findOne({ 
          organisme: 'AMAIR', 
          annee: oldParam.annee 
        });

        if (existingAMAIR) {
          console.log(`  ⏭️  AMAIR ${oldParam.annee} existe déjà, ignoré`);
          skippedCount++;
        } else {
          await Parametre.create({
            organisme: 'AMAIR',
            annee: oldParam.annee,
            tarifs: oldParam.tarifsAMAIR || { loisir: 25, professionnel: 45 },
            adhesionsOuvertes: estAnneeEnCours ? true : (oldParam.adhesionsOuvertes || false),
            estAnneeEnCours: estAnneeEnCours
          });
          console.log(`  ✅ AMAIR ${oldParam.annee} créé`);
          migratedCount++;
        }
      } catch (error) {
        console.error(`  ❌ Erreur AMAIR ${oldParam.annee}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Résumé de la migration:');
    console.log(`  • Paramètres migrés: ${migratedCount}`);
    console.log(`  • Paramètres ignorés (déjà existants): ${skippedCount}`);
    console.log('='.repeat(50));

    // Afficher tous les nouveaux paramètres
    console.log('\n📋 Paramètres actuels dans la base:');
    const allParametres = await Parametre.find({}).sort({ annee: -1, organisme: 1 });
    
    for (const param of allParametres) {
      const status = param.estAnneeEnCours ? '(EN COURS)' : '';
      const adhesions = param.adhesionsOuvertes ? '✅ Ouvertes' : '❌ Fermées';
      console.log(`  • ${param.organisme} ${param.annee} ${status}`);
      console.log(`    Tarifs: Loisir ${param.tarifs.loisir}€ | Pro ${param.tarifs.professionnel}€`);
      console.log(`    Adhésions: ${adhesions}`);
    }

    console.log('\n🎉 Migration terminée avec succès !');
    console.log('\n💡 Prochaines étapes:');
    console.log('  1. Vérifier les paramètres ci-dessus');
    console.log('  2. Remplacer les routes dans server.js');
    console.log('  3. Redémarrer le backend');
    console.log('  4. Tester l\'API /api/parametres/annees-disponibles');

  } catch (error) {
    console.error('\n❌ Erreur lors de la migration:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Déconnecté de MongoDB');
    process.exit(0);
  }
};

// Exécuter la migration
console.log('╔════════════════════════════════════════════════╗');
console.log('║   MIGRATION DES PARAMÈTRES D\'ADHÉSION         ║');
console.log('╚════════════════════════════════════════════════╝\n');

migrateParametres();
