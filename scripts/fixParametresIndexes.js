/**
 * Script pour corriger les index de la collection parametres
 * Supprime l'ancien index sur 'annee' seul et crée le bon index sur 'organisme + annee'
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

const fixIndexes = async () => {
  try {
    console.log('\n🔧 Correction des index de la collection parametres...\n');

    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('parametres');

    // Lister les index existants
    console.log('📋 Index actuels:');
    const indexes = await collection.indexes();
    indexes.forEach(index => {
      console.log(`  • ${JSON.stringify(index.key)} - ${index.name}`);
    });

    // Supprimer l'ancien index sur 'annee' seul
    console.log('\n🗑️  Suppression des anciens index...');
    try {
      await collection.dropIndex('annee_1');
      console.log('  ✅ Index "annee_1" supprimé');
    } catch (error) {
      if (error.code === 27) {
        console.log('  ⏭️  Index "annee_1" n\'existe pas (déjà supprimé)');
      } else {
        console.log(`  ⚠️  Erreur lors de la suppression: ${error.message}`);
      }
    }

    // Créer le bon index (organisme + annee)
    console.log('\n✨ Création du nouvel index...');
    try {
      await collection.createIndex(
        { organisme: 1, annee: 1 },
        { unique: true, name: 'organisme_1_annee_1' }
      );
      console.log('  ✅ Index "organisme_1_annee_1" créé (unique)');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('  ⏭️  Index "organisme_1_annee_1" existe déjà');
      } else {
        console.log(`  ⚠️  Erreur: ${error.message}`);
      }
    }

    // Afficher les index finaux
    console.log('\n📋 Index finaux:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(index => {
      console.log(`  • ${JSON.stringify(index.key)} - ${index.name}`);
    });

    console.log('\n✅ Correction des index terminée !\n');

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Déconnecté de MongoDB\n');
    process.exit(0);
  }
};

fixIndexes();
