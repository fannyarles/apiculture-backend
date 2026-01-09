const mongoose = require('mongoose');
require('dotenv').config();

// Importer les modèles
const User = require('./models/userModel');
const Preference = require('./models/preferenceModel');

// Connexion à la base de données
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    process.exit(1);
  }
};

// Script principal
const createPreferencesForAllUsers = async () => {
  try {
    console.log('🔄 Début du script de création des préférences...\n');

    // Récupérer tous les utilisateurs
    const users = await User.find({});
    console.log(`📊 ${users.length} utilisateurs trouvés dans la base de données\n`);

    let created = 0;
    let alreadyExists = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Vérifier si l'utilisateur a déjà des préférences
        const existingPref = await Preference.findOne({ user: user._id });

        if (existingPref) {
          console.log(`⏭️  Préférences déjà existantes pour ${user.prenom} ${user.nom} (${user.email})`);
          alreadyExists++;
        } else {
          // Créer les préférences avec toutes les options à true
          const newPreference = new Preference({
            user: user._id,
            communications: {
              mesGroupements: true,
              autresGroupements: true,
              alertesSanitaires: true,
            },
          });

          await newPreference.save();
          console.log(`✅ Préférences créées pour ${user.prenom} ${user.nom} (${user.email})`);
          created++;
        }
      } catch (error) {
        console.error(`❌ Erreur pour ${user.prenom} ${user.nom} (${user.email}):`, error.message);
        errors++;
      }
    }

    console.log('\n📈 Résumé:');
    console.log(`   ✅ Préférences créées: ${created}`);
    console.log(`   ⏭️  Déjà existantes: ${alreadyExists}`);
    console.log(`   ❌ Erreurs: ${errors}`);
    console.log(`   📊 Total: ${users.length}`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution du script:', error);
  } finally {
    // Fermer la connexion
    await mongoose.connection.close();
    console.log('\n🔌 Connexion MongoDB fermée');
    process.exit(0);
  }
};

// Exécuter le script
const run = async () => {
  await connectDB();
  await createPreferencesForAllUsers();
};

run();
