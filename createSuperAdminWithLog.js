const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Fichier de log
const logFile = path.join(__dirname, 'superadmin-creation.log');
const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.log(message);
};

// Initialiser le log
fs.writeFileSync(logFile, '=== CRÉATION SUPER-ADMIN ===\n');

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '.env') });

log('🚀 Démarrage du script de création de super-admin...');

const createSuperAdmin = async () => {
  try {
    // Vérifier que MONGO_URI existe
    if (!process.env.MONGO_URI) {
      log('❌ MONGO_URI n\'est pas défini dans le fichier .env');
      process.exit(1);
    }

    log('🔌 Tentative de connexion à MongoDB...');
    
    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    log('✅ Connecté à MongoDB avec succès');

    // Charger le modèle User
    const User = require('./models/userModel');
    log('📦 Modèle User chargé');

    // Données du super-admin
    const superAdminData = {
      prenom: 'Super',
      nom: 'Admin',
      email: 'superadmin@apiculture.fr',
      password: 'SuperAdmin2024!',
      role: 'super_admin',
      isActive: true,
    };

    log('🔍 Vérification si un super-admin existe déjà...');
    
    // Vérifier si le super-admin existe déjà
    const existingUser = await User.findOne({ email: superAdminData.email });
    
    if (existingUser) {
      log('⚠️  Un utilisateur avec cet email existe déjà');
      log(`👤 Utilisateur: ${existingUser.prenom} ${existingUser.nom} (${existingUser.role})`);
      
      // Mettre à jour le rôle en super_admin
      existingUser.role = 'super_admin';
      existingUser.isActive = true;
      await existingUser.save();
      
      log('✅ Utilisateur mis à jour en super-admin');
      log(`📧 Email: ${superAdminData.email}`);
      log('🔑 Mot de passe: (inchangé)');
    } else {
      log('📝 Création d\'un nouveau super-admin...');
      
      // Le mot de passe sera hashé automatiquement par le pre-save hook
      const superAdmin = await User.create(superAdminData);

      log('✅ Super-admin créé avec succès !');
      log(`📧 Email: ${superAdminData.email}`);
      log(`🔑 Mot de passe: ${superAdminData.password}`);
      log('⚠️  IMPORTANT: Changez ce mot de passe après la première connexion !');
    }

    // Afficher tous les super-admins
    log('📊 Liste de tous les super-admins:');
    const allSuperAdmins = await User.find({ role: 'super_admin' });
    allSuperAdmins.forEach((admin, index) => {
      log(`   ${index + 1}. ${admin.prenom} ${admin.nom} (${admin.email}) - Actif: ${admin.isActive}`);
    });

    await mongoose.connection.close();
    log('🔌 Connexion MongoDB fermée');
    log('✨ Script terminé avec succès');
    log(`\n📄 Log sauvegardé dans: ${logFile}`);
    
    process.exit(0);
  } catch (error) {
    log(`❌ ERREUR: ${error.message}`);
    log(`📚 Stack: ${error.stack}`);
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
};

createSuperAdmin();
