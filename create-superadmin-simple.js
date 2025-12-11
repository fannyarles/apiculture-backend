require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userModel');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const email = 'superadmin@apiculture.fr';
    const password = 'SuperAdmin2024!';
    
    let user = await User.findOne({ email });
    
    if (user) {
      user.role = 'super_admin';
      user.isActive = true;
      await user.save();
      console.log('✅ Utilisateur mis à jour en super-admin');
    } else {
      user = await User.create({
        prenom: 'Super',
        nom: 'Admin',
        email,
        password,
        role: 'super_admin',
        isActive: true
      });
      console.log('✅ Super-admin créé');
      console.log('Email:', email);
      console.log('Password:', password);
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();
