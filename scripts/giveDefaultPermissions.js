/**
 * Script pour donner les permissions par défaut aux admins existants
 * À exécuter une seule fois après l'ajout du système de permissions
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/userModel');

// Charger les variables d'environnement
dotenv.config();

const giveDefaultPermissions = async () => {
  try {
    // Connexion à la base de données
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');

    // Trouver tous les admins
    const admins = await User.find({ role: 'admin' });
    console.log(`📊 ${admins.length} administrateurs trouvés`);

    // Permissions par défaut pour les admins
    const defaultPermissions = {
      communications: true,
      blog: true,
      adherents: true,
      paiementLink: true,
    };

    let updated = 0;
    let skipped = 0;

    for (const admin of admins) {
      // Si les permissions existent déjà et sont complètes, passer
      if (admin.permissions && 
          admin.permissions.communications !== undefined &&
          admin.permissions.blog !== undefined &&
          admin.permissions.adherents !== undefined &&
          admin.permissions.paiementLink !== undefined) {
        console.log(`⏭️  ${admin.email} - permissions déjà définies`);
        skipped++;
        continue;
      }

      // Donner les permissions par défaut
      admin.permissions = {
        ...defaultPermissions,
        ...admin.permissions // Garder les permissions existantes si présentes
      };
      
      await admin.save();
      console.log(`✅ ${admin.email} - permissions accordées:`, admin.permissions);
      updated++;
    }

    console.log('\n📈 Résumé:');
    console.log(`   - Mis à jour: ${updated}`);
    console.log(`   - Ignorés (déjà configurés): ${skipped}`);
    console.log(`   - Total: ${admins.length}`);
    console.log('\n💡 Note: Les super_admins ont automatiquement toutes les permissions');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
};

// Exécuter
giveDefaultPermissions();
