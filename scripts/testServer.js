/**
 * Script pour tester que le serveur démarre correctement
 * et que toutes les routes sont disponibles
 */

const axios = require('axios');

const API_URL = 'http://localhost:5000';

const testRoutes = async () => {
  console.log('\n🧪 Test des routes API...\n');

  const routes = [
    { method: 'GET', path: '/', name: 'Route racine' },
    { method: 'POST', path: '/api/auth/login', name: 'Login', needsBody: true },
    { method: 'GET', path: '/api/adhesions', name: 'Adhésions (nécessite auth)', needsAuth: true },
    { method: 'GET', path: '/api/parametres', name: 'Paramètres (nécessite auth)', needsAuth: true },
    { method: 'GET', path: '/api/settings/annees-disponibles', name: 'Années disponibles' },
  ];

  for (const route of routes) {
    try {
      const config = {};
      
      if (route.needsAuth) {
        console.log(`⏭️  ${route.name} - Ignoré (nécessite authentification)`);
        continue;
      }

      if (route.needsBody) {
        console.log(`⏭️  ${route.name} - Ignoré (nécessite body)`);
        continue;
      }

      const response = await axios({
        method: route.method,
        url: `${API_URL}${route.path}`,
        ...config,
        validateStatus: () => true // Accepter tous les status codes
      });

      if (response.status === 200) {
        console.log(`✅ ${route.name} - OK (${response.status})`);
      } else if (response.status === 401) {
        console.log(`🔒 ${route.name} - Protégé (${response.status})`);
      } else if (response.status === 404) {
        console.log(`❌ ${route.name} - Non trouvé (${response.status})`);
      } else {
        console.log(`⚠️  ${route.name} - Status ${response.status}`);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`❌ ${route.name} - Serveur non accessible`);
        console.log('\n⚠️  Le serveur ne semble pas démarré !');
        console.log('   Vérifiez que "npm start" fonctionne sans erreur.\n');
        break;
      } else {
        console.log(`❌ ${route.name} - Erreur: ${error.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(50));
};

// Test spécifique pour la route de paiement
const testPaymentRoute = async () => {
  console.log('\n💳 Test spécifique de la route de paiement...\n');

  try {
    const response = await axios({
      method: 'POST',
      url: `${API_URL}/api/payment/create-payment-session`,
      validateStatus: () => true
    });

    if (response.status === 401) {
      console.log('✅ Route de paiement existe (401 - Auth requise)');
    } else if (response.status === 404) {
      console.log('❌ Route de paiement NON TROUVÉE (404)');
      console.log('\n🔍 Vérifications à faire:');
      console.log('   1. Le serveur a-t-il démarré correctement ?');
      console.log('   2. Les routes sont-elles montées dans server.js ?');
      console.log('   3. Le fichier paymentRoutes.js existe-t-il ?');
    } else {
      console.log(`⚠️  Route de paiement - Status ${response.status}`);
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Serveur non accessible');
      console.log('\n⚠️  PROBLÈME: Le serveur ne démarre pas !');
      console.log('\n🔧 Solutions:');
      console.log('   1. Vérifiez les logs de "npm start"');
      console.log('   2. Vérifiez la connexion MongoDB');
      console.log('   3. Vérifiez les variables d\'environnement (.env)');
      console.log('   4. Vérifiez qu\'il n\'y a pas d\'erreur de syntaxe\n');
    } else {
      console.log(`❌ Erreur: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(50) + '\n');
};

const main = async () => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   TEST DU SERVEUR ET DES ROUTES                ║');
  console.log('╚════════════════════════════════════════════════╝');

  await testRoutes();
  await testPaymentRoute();

  console.log('💡 Si le serveur n\'est pas accessible:');
  console.log('   1. Ouvrez un autre terminal');
  console.log('   2. cd backend');
  console.log('   3. npm start');
  console.log('   4. Vérifiez qu\'il n\'y a pas d\'erreur');
  console.log('   5. Relancez ce script\n');
};

main();
