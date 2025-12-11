/**
 * Script de migration pour ajouter le champ 'role' aux utilisateurs qui n'en ont pas
 * et s'assurer que tous les admins ont le double rôle ['admin', 'user']
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/userModel');

const migrateUserRoles = async () => {
  try {
    // Connexion à la base de données
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');

    // 1. Trouver tous les utilisateurs sans champ 'role' mais avec 'roles'
    const usersWithoutRole = await User.find({ 
      role: { $exists: false },
      roles: { $exists: true }
    });

    console.log(`\n📊 ${usersWithoutRole.length} utilisateur(s) sans champ 'role' trouvé(s)`);

    for (const user of usersWithoutRole) {
      // Déterminer le rôle principal basé sur roles[]
      let mainRole = 'user';
      if (user.roles.includes('super_admin')) {
        mainRole = 'super_admin';
      } else if (user.roles.includes('admin')) {
        mainRole = 'admin';
      }

      user.role = mainRole;
      await user.save();
      console.log(`✅ ${user.email}: role défini à '${mainRole}'`);
    }

    // 2. S'assurer que tous les admins ont le rôle 'user' dans leur tableau roles
    const adminsWithoutUserRole = await User.find({
      role: { $in: ['admin', 'super_admin'] },
      roles: { $nin: ['user'] }
    });

    console.log(`\n📊 ${adminsWithoutUserRole.length} admin(s) sans rôle 'user' trouvé(s)`);

    for (const admin of adminsWithoutUserRole) {
      if (!admin.roles.includes('user')) {
        admin.roles.push('user');
        await admin.save();
        console.log(`✅ ${admin.email}: rôle 'user' ajouté aux roles`);
      }
    }

    // 3. S'assurer que le champ 'role' est cohérent avec 'roles'
    const allUsers = await User.find({});
    console.log(`\n📊 Vérification de la cohérence pour ${allUsers.length} utilisateur(s)`);

    for (const user of allUsers) {
      let needsUpdate = false;

      // Si roles n'existe pas, le créer basé sur role
      if (!user.roles || user.roles.length === 0) {
        user.roles = [user.role];
        needsUpdate = true;
      }

      // Si role n'est pas dans roles, l'ajouter
      if (!user.roles.includes(user.role)) {
        user.roles.push(user.role);
        needsUpdate = true;
      }

      // Pour les admins, s'assurer qu'ils ont aussi 'user'
      if ((user.role === 'admin' || user.role === 'super_admin') && !user.roles.includes('user')) {
        user.roles.push('user');
        needsUpdate = true;
      }

      if (needsUpdate) {
        await user.save();
        console.log(`✅ ${user.email}: roles mis à jour -> [${user.roles.join(', ')}]`);
      }
    }

    console.log('\n✅ Migration terminée avec succès !');
    
    // Afficher un résumé
    const summary = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('\n📊 Résumé des utilisateurs par rôle :');
    summary.forEach(item => {
      console.log(`   - ${item._id}: ${item.count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  }
};

// Exécuter la migration
migrateUserRoles();
