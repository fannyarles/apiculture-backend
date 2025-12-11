const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('🚀 Démarrage du script de création de super-admin...');
console.log('📁 Répertoire de travail:', __dirname);

const createSuperAdmin = async () => {
  try {
    // Vérifier que MONGO_URI existe
    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI n\'est pas défini dans le fichier .env');
      console.log('💡 Assurez-vous que le fichier .env existe et contient MONGO_URI');
      process.exit(1);
    }

    console.log('🔌 Tentative de connexion à MongoDB...');
    console.log('📍 URI:', process.env.MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Masquer les credentials
    
    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB avec succès');

    // Charger le modèle User
    const User = require('../models/userModel');
    console.log('📦 Modèle User chargé');

    // Données du super-admin
    const superAdminData = {
      prenom: 'Super',
      nom: 'Admin',
      email: 'superadmin@apiculture.fr',
      password: 'SuperAdmin2024!',
      role: 'super_admin',
      isActive: true,
    };

    console.log('\n🔍 Vérification si un super-admin existe déjà...');
    
    // Vérifier si le super-admin existe déjà
    const existingUser = await User.findOne({ email: superAdminData.email });
    
    if (existingUser) {
      console.log('⚠️  Un utilisateur avec cet email existe déjà');
      console.log('👤 Utilisateur actuel:');
      console.log('   - Nom:', existingUser.prenom, existingUser.nom);
      console.log('   - Email:', existingUser.email);
      console.log('   - Rôle actuel:', existingUser.role);
      
      // Mettre à jour le rôle en super_admin
      existingUser.role = 'super_admin';
      existingUser.isActive = true;
      await existingUser.save();
      
      console.log('\n✅ Utilisateur mis à jour en super-admin');
      console.log('\n📋 INFORMATIONS DE CONNEXION:');
      console.log('   📧 Email:', superAdminData.email);
      console.log('   🔑 Mot de passe: (inchangé - utilisez votre mot de passe actuel)');
    } else {
      console.log('📝 Création d\'un nouveau super-admin...');
      
      // Le mot de passe sera hashé automatiquement par le pre-save hook
      const superAdmin = await User.create(superAdminData);

      console.log('\n✅ Super-admin créé avec succès !');
      console.log('\n📋 INFORMATIONS DE CONNEXION:');
      console.log('   📧 Email:', superAdminData.email);
      console.log('   🔑 Mot de passe:', superAdminData.password);
      console.log('\n⚠️  IMPORTANT: Changez ce mot de passe après la première connexion !');
    }

    // Afficher tous les super-admins
    console.log('\n📊 Liste de tous les super-admins:');
    const allSuperAdmins = await User.find({ role: 'super_admin' });
    allSuperAdmins.forEach((admin, index) => {
      console.log(`   ${index + 1}. ${admin.prenom} ${admin.nom} (${admin.email}) - Actif: ${admin.isActive}`);
    });

    await mongoose.connection.close();
    console.log('\n🔌 Connexion MongoDB fermée');
    console.log('✨ Script terminé avec succès\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    console.error('📚 Stack trace:', error.stack);
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
};

createSuperAdmin();
