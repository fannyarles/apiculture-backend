/**
 * Script pour assigner un organisme à un admin
 * Usage: node assignOrganismeAdmin.js <email> <organisme>
 * Exemple: node assignOrganismeAdmin.js admin@sar.fr SAR
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/userModel');

// Charger les variables d'environnement
dotenv.config();

const assignOrganisme = async () => {
  try {
    // Récupérer les arguments
    const email = process.argv[2];
    const organisme = process.argv[3];

    if (!email || !organisme) {
      console.log('\n❌ Usage: node assignOrganismeAdmin.js <email> <organisme>');
      console.log('   Exemple: node assignOrganismeAdmin.js admin@sar.fr SAR\n');
      process.exit(1);
    }

    if (!['SAR', 'AMAIR'].includes(organisme)) {
      console.log('\n❌ Organisme invalide. Doit être SAR ou AMAIR\n');
      process.exit(1);
    }

    console.log('\n🔄 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté\n');

    // Trouver l'admin
    const admin = await User.findOne({ email: email.toLowerCase() });

    if (!admin) {
      console.log(`❌ Aucun utilisateur trouvé avec l'email: ${email}\n`);
      process.exit(1);
    }

    if (admin.role !== 'admin') {
      console.log(`❌ L'utilisateur ${email} n'est pas un admin (role: ${admin.role})\n`);
      process.exit(1);
    }

    // Assigner l'organisme
    admin.organisme = organisme;
    await admin.save({ validateBeforeSave: false });

    console.log('✅ Organisme assigné avec succès !');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Nom: ${admin.prenom} ${admin.nom}`);
    console.log(`   Organisme: ${admin.organisme}\n`);

  } catch (error) {
    console.error('\n❌ Erreur:', error.message, '\n');
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

assignOrganisme();
