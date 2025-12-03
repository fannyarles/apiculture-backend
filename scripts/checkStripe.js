/**
 * Script pour vérifier la configuration Stripe
 */

const dotenv = require('dotenv');
dotenv.config();

console.log('\n╔════════════════════════════════════════════════╗');
console.log('║   VÉRIFICATION CONFIGURATION STRIPE            ║');
console.log('╚════════════════════════════════════════════════╝\n');

// Vérifier les variables d'environnement
const requiredVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FRONTEND_URL'
];

let allPresent = true;

console.log('📋 Variables d\'environnement:\n');

requiredVars.forEach(varName => {
  const value = process.env[varName];
  
  if (!value) {
    console.log(`❌ ${varName}: NON DÉFINIE`);
    allPresent = false;
  } else {
    // Masquer la clé pour la sécurité
    const maskedValue = value.substring(0, 10) + '...' + value.substring(value.length - 4);
    console.log(`✅ ${varName}: ${maskedValue}`);
  }
});

console.log('\n' + '='.repeat(50));

if (!allPresent) {
  console.log('\n⚠️  ATTENTION: Variables manquantes détectées!\n');
  console.log('🔧 Ajoutez ces variables dans votre fichier .env:\n');
  console.log('STRIPE_SECRET_KEY=sk_test_...');
  console.log('STRIPE_WEBHOOK_SECRET=whsec_...');
  console.log('FRONTEND_URL=http://localhost:3000\n');
  console.log('📚 Pour obtenir vos clés Stripe:');
  console.log('   1. Allez sur https://dashboard.stripe.com/test/apikeys');
  console.log('   2. Copiez votre "Secret key"');
  console.log('   3. Pour le webhook secret, créez un webhook endpoint\n');
  process.exit(1);
} else {
  console.log('\n✅ Toutes les variables Stripe sont définies!\n');
  
  // Tester la connexion Stripe
  console.log('🔌 Test de connexion à Stripe...\n');
  
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    // Test simple: récupérer le compte
    stripe.balance.retrieve()
      .then(balance => {
        console.log('✅ Connexion Stripe réussie!');
        console.log(`   Devise: ${balance.available[0]?.currency || 'N/A'}`);
        console.log(`   Solde disponible: ${(balance.available[0]?.amount || 0) / 100} ${balance.available[0]?.currency?.toUpperCase() || ''}\n`);
        console.log('🎉 Configuration Stripe OK!\n');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Erreur de connexion Stripe:', error.message);
        console.error('\n🔧 Vérifications:');
        console.error('   1. Votre clé STRIPE_SECRET_KEY est-elle valide ?');
        console.error('   2. Utilisez-vous une clé de test (sk_test_...) ?');
        console.error('   3. Votre compte Stripe est-il actif ?\n');
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation de Stripe:', error.message);
    console.error('\n🔧 Vérifiez que le module "stripe" est installé:');
    console.error('   npm install stripe\n');
    process.exit(1);
  }
}
