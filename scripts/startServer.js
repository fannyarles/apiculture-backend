/**
 * Script de démarrage sécurisé du serveur
 * Vérifie la base de données avant de démarrer
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const checkAndStart = async () => {
  try {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   VÉRIFICATION AVANT DÉMARRAGE                 ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // 1. Vérifier la connexion MongoDB
    console.log('1️⃣  Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('   ✅ Connecté à MongoDB\n');

    // 2. Vérifier les index de la collection parametres
    console.log('2️⃣  Vérification des index...');
    const db = mongoose.connection.db;
    const parametresCollection = db.collection('parametres');
    
    const indexes = await parametresCollection.indexes();
    console.log('   Indexes actuels:');
    indexes.forEach(index => {
      console.log(`   • ${JSON.stringify(index.key)} - ${index.name}`);
    });

    // Vérifier si l'ancien index existe encore
    const hasOldIndex = indexes.some(idx => idx.name === 'annee_1');
    if (hasOldIndex) {
      console.log('\n   ⚠️  ATTENTION: Ancien index "annee_1" détecté !');
      console.log('   🔧 Suppression automatique...');
      
      try {
        await parametresCollection.dropIndex('annee_1');
        console.log('   ✅ Index "annee_1" supprimé\n');
      } catch (error) {
        console.log(`   ❌ Erreur: ${error.message}\n`);
      }
    } else {
      console.log('   ✅ Pas d\'ancien index\n');
    }

    // 3. Vérifier que le bon index existe
    const hasCorrectIndex = indexes.some(idx => idx.name === 'organisme_1_annee_1');
    if (!hasCorrectIndex) {
      console.log('3️⃣  Création du bon index...');
      await parametresCollection.createIndex(
        { organisme: 1, annee: 1 },
        { unique: true, name: 'organisme_1_annee_1' }
      );
      console.log('   ✅ Index "organisme_1_annee_1" créé\n');
    } else {
      console.log('3️⃣  ✅ Index correct déjà présent\n');
    }

    // 4. Vérifier les collections essentielles
    console.log('4️⃣  Vérification des collections...');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const requiredCollections = ['users', 'parametres', 'adhesions'];
    requiredCollections.forEach(name => {
      if (collectionNames.includes(name)) {
        console.log(`   ✅ Collection "${name}" existe`);
      } else {
        console.log(`   ⚠️  Collection "${name}" n'existe pas (sera créée au besoin)`);
      }
    });

    console.log('\n' + '='.repeat(50));
    console.log('✅ Toutes les vérifications sont passées !');
    console.log('='.repeat(50) + '\n');

    console.log('🚀 Vous pouvez maintenant démarrer le serveur:');
    console.log('   npm start\n');

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error('\n🔧 Solutions possibles:');
    console.error('   1. Vérifiez que MongoDB est démarré');
    console.error('   2. Vérifiez MONGO_URI dans .env');
    console.error('   3. Vérifiez les permissions MongoDB\n');
    
    await mongoose.connection.close();
    process.exit(1);
  }
};

checkAndStart();
