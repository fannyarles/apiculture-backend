/**
 * Script pour vérifier l'état de la base de données
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/userModel');
const Parametre = require('../models/parametreModel');

dotenv.config();

const checkDatabase = async () => {
  try {
    console.log('\n🔍 Vérification de la base de données...\n');

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Vérifier les admins
    console.log('👥 ADMINS:');
    const admins = await User.find({ role: 'admin' }).select('email prenom nom organisme role');
    
    if (admins.length === 0) {
      console.log('  ❌ Aucun admin trouvé\n');
    } else {
      admins.forEach(admin => {
        console.log(`  • ${admin.email}`);
        console.log(`    Nom: ${admin.prenom} ${admin.nom}`);
        console.log(`    Organisme: ${admin.organisme || '⚠️  NON DÉFINI'}`);
        console.log(`    Role: ${admin.role}`);
        console.log('');
      });
    }

    // Vérifier les paramètres
    console.log('📊 PARAMÈTRES:');
    const parametres = await Parametre.find({}).sort({ organisme: 1, annee: -1 });
    
    if (parametres.length === 0) {
      console.log('  ❌ Aucun paramètre trouvé\n');
      console.log('  💡 Solution: Exécutez "node scripts/createAdmins.js"\n');
    } else {
      parametres.forEach(param => {
        const status = param.estAnneeEnCours ? '[EN COURS]' : '';
        console.log(`  • ${param.organisme} ${param.annee} ${status}`);
        console.log(`    Tarifs: Loisir ${param.tarifs.loisir}€ | Pro ${param.tarifs.professionnel}€`);
        console.log(`    Adhésions: ${param.adhesionsOuvertes ? '✅ Ouvertes' : '❌ Fermées'}`);
        console.log('');
      });
    }

    // Résumé
    console.log('=' .repeat(50));
    console.log(`Total admins: ${admins.length}`);
    console.log(`Total paramètres: ${parametres.length}`);
    console.log('=' .repeat(50));

    if (parametres.length === 0) {
      console.log('\n⚠️  PROBLÈME DÉTECTÉ:');
      console.log('   La collection parametres est vide !');
      console.log('\n✅ SOLUTION:');
      console.log('   Exécutez: node scripts/createAdmins.js');
      console.log('   Cela créera les paramètres SAR et AMAIR pour 2025\n');
    }

    if (admins.some(a => !a.organisme)) {
      console.log('\n⚠️  PROBLÈME DÉTECTÉ:');
      console.log('   Certains admins n\'ont pas d\'organisme assigné !');
      console.log('\n✅ SOLUTION:');
      console.log('   Exécutez: node scripts/assignOrganismeAdmin.js <email> <organisme>\n');
    }

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Déconnecté de MongoDB\n');
    process.exit(0);
  }
};

checkDatabase();
