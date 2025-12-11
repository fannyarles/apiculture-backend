const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/userModel');

// Charger les variables d'environnement
dotenv.config();

const createSuperAdmin = async () => {
  try {
    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');

    // Données du super-admin
    const superAdminData = {
      prenom: 'Super',
      nom: 'Admin',
      email: 'superadmin@apiculture.fr',
      password: 'SuperAdmin2024!',
      role: 'super_admin',
      isActive: true,
    };

    // Vérifier si le super-admin existe déjà
    const existingUser = await User.findOne({ email: superAdminData.email });
    
    if (existingUser) {
      console.log('⚠️  Un utilisateur avec cet email existe déjà');
      
      // Mettre à jour le rôle en super_admin
      existingUser.role = 'super_admin';
      existingUser.isActive = true;
      await existingUser.save();
      
      console.log('✅ Utilisateur mis à jour en super-admin');
      console.log('\n📧 Email:', superAdminData.email);
      console.log('🔑 Mot de passe: (inchangé)');
    } else {
      // Hasher le mot de passe
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(superAdminData.password, salt);
      
      // Créer le super-admin
      const superAdmin = await User.create({
        ...superAdminData,
        password: hashedPassword,
      });

      console.log('✅ Super-admin créé avec succès !');
      console.log('\n📧 Email:', superAdminData.email);
      console.log('🔑 Mot de passe:', superAdminData.password);
      console.log('\n⚠️  IMPORTANT: Changez ce mot de passe après la première connexion !');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
};

createSuperAdmin();
