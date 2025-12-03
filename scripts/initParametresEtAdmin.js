/**
 * Script d'initialisation
 * 1. Crée les paramètres pour l'année en cours (SAR et AMAIR)
 * 2. Met à jour les admins pour leur assigner un organisme
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Parametre = require('../models/parametreModel');
const User = require('../models/userModel');

// Charger les variables d'environnement
dotenv.config();

const initParametresEtAdmin = async () => {
  try {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   INITIALISATION PARAMÈTRES ET ADMINS          ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB\n');

    const currentYear = new Date().getFullYear();

    // ========================================
    // PARTIE 1: CRÉER LES PARAMÈTRES
    // ========================================
    console.log('📊 PARTIE 1: Création des paramètres\n');

    // Vérifier si les paramètres existent déjà
    const existingSAR = await Parametre.findOne({ organisme: 'SAR', annee: currentYear });
    const existingAMAIR = await Parametre.findOne({ organisme: 'AMAIR', annee: currentYear });

    if (existingSAR) {
      console.log(`  ⏭️  SAR ${currentYear} existe déjà`);
    } else {
      await Parametre.create({
        organisme: 'SAR',
        annee: currentYear,
        tarifs: {
          loisir: 30,
          professionnel: 50
        },
        adhesionsOuvertes: true,
        estAnneeEnCours: true,
        dateCreation: new Date()
      });
      console.log(`  ✅ SAR ${currentYear} créé (Loisir: 30€, Pro: 50€)`);
    }

    if (existingAMAIR) {
      console.log(`  ⏭️  AMAIR ${currentYear} existe déjà`);
    } else {
      await Parametre.create({
        organisme: 'AMAIR',
        annee: currentYear,
        tarifs: {
          loisir: 25,
          professionnel: 45
        },
        adhesionsOuvertes: true,
        estAnneeEnCours: true,
        dateCreation: new Date()
      });
      console.log(`  ✅ AMAIR ${currentYear} créé (Loisir: 25€, Pro: 45€)`);
    }

    // ========================================
    // PARTIE 2: METTRE À JOUR LES ADMINS
    // ========================================
    console.log('\n👥 PARTIE 2: Configuration des admins\n');

    // Récupérer tous les admins
    const admins = await User.find({ role: 'admin' });
    console.log(`  📋 ${admins.length} admin(s) trouvé(s)\n`);

    if (admins.length === 0) {
      console.log('  ⚠️  Aucun admin trouvé. Créez d\'abord un compte admin.\n');
    } else {
      for (const admin of admins) {
        if (admin.organisme) {
          console.log(`  ✓ ${admin.email} → ${admin.organisme} (déjà configuré)`);
        } else {
          // Demander à l'utilisateur ou assigner par défaut
          // Pour le premier admin, on assigne SAR par défaut
          const organisme = 'SAR'; // Vous pouvez changer ceci
          
          admin.organisme = organisme;
          await admin.save({ validateBeforeSave: false });
          
          console.log(`  ✅ ${admin.email} → ${organisme} (assigné)`);
        }
      }
    }

    // ========================================
    // PARTIE 3: RÉSUMÉ
    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('📊 RÉSUMÉ FINAL\n');

    const allParametres = await Parametre.find({}).sort({ annee: -1, organisme: 1 });
    console.log('Paramètres dans la base:');
    for (const param of allParametres) {
      const status = param.estAnneeEnCours ? '(EN COURS)' : '';
      const adhesions = param.adhesionsOuvertes ? '✅ Ouvertes' : '❌ Fermées';
      console.log(`  • ${param.organisme} ${param.annee} ${status}`);
      console.log(`    Tarifs: Loisir ${param.tarifs.loisir}€ | Pro ${param.tarifs.professionnel}€`);
      console.log(`    Adhésions: ${adhesions}`);
    }

    console.log('\nAdmins configurés:');
    const allAdmins = await User.find({ role: 'admin' }).select('email organisme');
    for (const admin of allAdmins) {
      console.log(`  • ${admin.email} → ${admin.organisme || '⚠️  NON CONFIGURÉ'}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('\n🎉 Initialisation terminée avec succès !');
    console.log('\n💡 Prochaines étapes:');
    console.log('  1. Redémarrer le backend');
    console.log('  2. Se connecter en tant qu\'admin');
    console.log('  3. Aller sur /admin/parametres-adhesion');
    console.log('  4. Vous devriez voir les paramètres de votre organisme\n');

  } catch (error) {
    console.error('\n❌ Erreur lors de l\'initialisation:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Déconnecté de MongoDB\n');
    process.exit(0);
  }
};

// Exécuter l'initialisation
initParametresEtAdmin();
