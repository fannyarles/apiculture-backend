/**
 * Script pour créer deux admins (SAR et AMAIR)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/userModel');
const Parametre = require('../models/parametreModel');

// Charger les variables d'environnement
dotenv.config();

const createAdmins = async () => {
  try {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   CRÉATION DES ADMINS SAR ET AMAIR             ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB\n');

    const currentYear = new Date().getFullYear();

    // ========================================
    // ADMIN SAR
    // ========================================
    console.log('👤 Création Admin SAR...');
    
    const emailSAR = 'admin@sar.fr';
    const existingSAR = await User.findOne({ email: emailSAR });

    if (existingSAR) {
      console.log(`  ⏭️  Admin SAR existe déjà (${emailSAR})`);
      
      // Mettre à jour l'organisme si nécessaire
      if (!existingSAR.organisme) {
        existingSAR.organisme = 'SAR';
        await existingSAR.save({ validateBeforeSave: false });
        console.log(`  ✅ Organisme SAR assigné à ${emailSAR}`);
      }
    } else {
      const hashedPassword = await bcrypt.hash('Admin123!', 10);
      
      await User.create({
        prenom: 'Admin',
        nom: 'SAR',
        email: emailSAR,
        password: hashedPassword,
        role: 'admin',
        organisme: 'SAR',
        telephone: '0123456789',
        isActive: true
      });
      
      console.log(`  ✅ Admin SAR créé`);
      console.log(`     Email: ${emailSAR}`);
      console.log(`     Mot de passe: Admin123!`);
    }

    // ========================================
    // ADMIN AMAIR
    // ========================================
    console.log('\n👤 Création Admin AMAIR...');
    
    const emailAMAIR = 'admin@amair.fr';
    const existingAMAIR = await User.findOne({ email: emailAMAIR });

    if (existingAMAIR) {
      console.log(`  ⏭️  Admin AMAIR existe déjà (${emailAMAIR})`);
      
      // Mettre à jour l'organisme si nécessaire
      if (!existingAMAIR.organisme) {
        existingAMAIR.organisme = 'AMAIR';
        await existingAMAIR.save({ validateBeforeSave: false });
        console.log(`  ✅ Organisme AMAIR assigné à ${emailAMAIR}`);
      }
    } else {
      const hashedPassword = await bcrypt.hash('Admin123!', 10);
      
      await User.create({
        prenom: 'Admin',
        nom: 'AMAIR',
        email: emailAMAIR,
        password: hashedPassword,
        role: 'admin',
        organisme: 'AMAIR',
        telephone: '0987654321',
        isActive: true
      });
      
      console.log(`  ✅ Admin AMAIR créé`);
      console.log(`     Email: ${emailAMAIR}`);
      console.log(`     Mot de passe: Admin123!`);
    }

    // ========================================
    // CRÉER LES PARAMÈTRES
    // ========================================
    console.log('\n📊 Création des paramètres...\n');

    // SAR
    const paramSAR = await Parametre.findOne({ organisme: 'SAR', annee: currentYear });
    if (!paramSAR) {
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
      console.log(`  ✅ Paramètres SAR ${currentYear} créés (Loisir: 30€, Pro: 50€)`);
    } else {
      console.log(`  ⏭️  Paramètres SAR ${currentYear} existent déjà`);
    }

    // AMAIR
    const paramAMAIR = await Parametre.findOne({ organisme: 'AMAIR', annee: currentYear });
    if (!paramAMAIR) {
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
      console.log(`  ✅ Paramètres AMAIR ${currentYear} créés (Loisir: 25€, Pro: 45€)`);
    } else {
      console.log(`  ⏭️  Paramètres AMAIR ${currentYear} existent déjà`);
    }

    // ========================================
    // RÉSUMÉ
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ FINAL\n');

    const allAdmins = await User.find({ role: 'admin' }).select('prenom nom email organisme');
    console.log('👥 Admins créés:\n');
    for (const admin of allAdmins) {
      console.log(`  • ${admin.prenom} ${admin.nom}`);
      console.log(`    Email: ${admin.email}`);
      console.log(`    Organisme: ${admin.organisme}`);
      console.log('');
    }

    const allParametres = await Parametre.find({}).sort({ organisme: 1, annee: -1 });
    console.log('📋 Paramètres créés:\n');
    for (const param of allParametres) {
      const status = param.estAnneeEnCours ? '(EN COURS)' : '';
      console.log(`  • ${param.organisme} ${param.annee} ${status}`);
      console.log(`    Tarifs: Loisir ${param.tarifs.loisir}€ | Pro ${param.tarifs.professionnel}€`);
      console.log(`    Adhésions: ${param.adhesionsOuvertes ? '✅ Ouvertes' : '❌ Fermées'}`);
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('\n🎉 Initialisation terminée avec succès !\n');
    console.log('🔐 IDENTIFIANTS DE CONNEXION:\n');
    console.log('  Admin SAR:');
    console.log('    Email: admin@sar.fr');
    console.log('    Mot de passe: Admin123!\n');
    console.log('  Admin AMAIR:');
    console.log('    Email: admin@amair.fr');
    console.log('    Mot de passe: Admin123!\n');
    console.log('💡 Prochaines étapes:');
    console.log('  1. Redémarrer le backend: npm start');
    console.log('  2. Se connecter avec un des comptes admin');
    console.log('  3. Aller sur /admin/parametres-adhesion');
    console.log('  4. Vous verrez les paramètres de votre organisme\n');

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Déconnecté de MongoDB\n');
    process.exit(0);
  }
};

// Exécuter
createAdmins();
