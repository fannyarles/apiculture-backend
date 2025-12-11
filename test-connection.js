console.log('=== TEST DE CONNEXION ===');
console.log('Node version:', process.version);
console.log('Working directory:', process.cwd());

const dotenv = require('dotenv');
const path = require('path');

// Charger .env
const envPath = path.join(__dirname, '.env');
console.log('Chemin .env:', envPath);

dotenv.config();

console.log('MONGO_URI défini:', !!process.env.MONGO_URI);
if (process.env.MONGO_URI) {
  console.log('MONGO_URI (masqué):', process.env.MONGO_URI.substring(0, 20) + '...');
}

const mongoose = require('mongoose');

async function testConnection() {
  try {
    console.log('\nTentative de connexion à MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connexion réussie!');
    
    const User = require('./models/userModel');
    const count = await User.countDocuments();
    console.log('Nombre d\'utilisateurs:', count);
    
    await mongoose.connection.close();
    console.log('Connexion fermée');
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testConnection();
