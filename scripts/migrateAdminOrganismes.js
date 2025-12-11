/**
 * Script de migration pour convertir le champ organisme en organismes[]
 * À exécuter une seule fois pour migrer les données existantes
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/userModel');

// Charger les variables d'environnement
dotenv.config();

const migrateAdminOrganismes = async () => {
  try {
    // Connexion à la base de données
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');

    // Trouver tous les admins
    const admins = await User.find({ role: 'admin' });
    console.log(`📊 ${admins.length} administrateurs trouvés`);

    let updated = 0;
    let skipped = 0;

    for (const admin of admins) {
      // Si organismes est déjà rempli, passer
      if (admin.organismes && admin.organismes.length > 0) {
        console.log(`⏭️  ${admin.email} - organismes déjà définis:`, admin.organismes);
        skipped++;
        continue;
      }

      // Si organisme existe, le copier dans organismes[]
      if (admin.organisme) {
        admin.organismes = [admin.organisme];
        await admin.save();
        console.log(`✅ ${admin.email} - migré: ${admin.organisme} → [${admin.organisme}]`);
        updated++;
      } else {
        console.log(`⚠️  ${admin.email} - aucun organisme défini`);
      }
    }

    console.log('\n📈 Résumé de la migration:');
    console.log(`   - Mis à jour: ${updated}`);
    console.log(`   - Ignorés: ${skipped}`);
    console.log(`   - Total: ${admins.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  }
};

// Exécuter la migration
migrateAdminOrganismes();
