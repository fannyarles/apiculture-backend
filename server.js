const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// Charger les variables d'environnement
if (process.env.NODE_ENV === 'preprod') {
  dotenv.config({ path: '.env.preprod' });
} else if (process.env.NODE_ENV === 'prod') {
  dotenv.config({ path: '.env.prod' });
} else {
  dotenv.config();
}

// Connexion à la base de données
connectDB();

const app = express();

// Initialiser les cron jobs pour la gestion des années
try {
  const { initCronJobs } = require('./cron/yearlyTasks');
  initCronJobs();
} catch (error) {
  console.error('⚠️  Erreur lors de l\'initialisation des cron jobs:', error.message);
  console.log('Le serveur va continuer sans les cron jobs automatiques.');
}

// Middleware
app.use(cors());

// IMPORTANT: Le webhook Stripe doit être AVANT express.json() car il nécessite le body raw
app.use('/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Routes
console.log('📍 Montage des routes...');
app.use('/auth', require('./routes/authRoutes'));
console.log('✅ /auth');
app.use('/adhesions', require('./routes/adhesionRoutes'));
console.log('✅ /adhesions');
app.use('/payment', require('./routes/paymentRoutes'));
console.log('✅ /payment');
app.use('/parametres', require('./routes/parametreRoutes'));
console.log('✅ /parametres');
app.use('/settings', require('./routes/settingsRoutes'));
console.log('✅ /settings');
app.use('/files', require('./routes/filesRoutes'));
console.log('✅ /files');
app.use('/actualites', require('./routes/blogRoutes'));
console.log('✅ /actualites');
app.use('/preferences', require('./routes/preferenceRoutes'));
console.log('✅ /preferences');
app.use('/communications', require('./routes/communicationRoutes'));
console.log('✅ /communications');
app.use('/organismes', require('./routes/organismeRoutes'));
console.log('✅ /organismes');
app.use('/admin-management', require('./routes/adminManagementRoutes'));
console.log('✅ /admin-management');
app.use('/users', require('./routes/superAdminRoutes'));
console.log('✅ /users');
app.use('/permissions', require('./routes/permissionRoutes'));
console.log('✅ /permissions');
app.use('/notification-settings', require('./routes/notificationSettingsRoutes'));
console.log('✅ /notification-settings');
app.use('/services', require('./routes/serviceRoutes'));
console.log('✅ /services');
app.use('/composition', require('./routes/compositionRoutes'));
console.log('✅ /composition');
app.use('/conseil', require('./routes/conseilRoutes'));
console.log('✅ /conseil');
app.use('/reunions', require('./routes/reunionRoutes'));
console.log('✅ /reunions');
app.use('/users-management', require('./routes/userRoutes'));
console.log('✅ /users-management');
app.use('/unaf-export', require('./routes/unafExportRoutes'));
console.log('✅ /unaf-export');
app.use('/service-settings', require('./routes/serviceSettingsRoutes'));
console.log('✅ /service-settings');
app.use('/stripe-account', require('./routes/stripeAccountRoutes'));
console.log('✅ /stripe-account');
app.use('/dev', require('./routes/devRoutes'));
console.log('✅ /dev');
app.use('/migration', require('./routes/migrationRoutes'));
console.log('✅ /migration');

// Servir les fichiers statiques pour les uploads
app.use('/uploads', express.static('uploads'));

console.log('SMTP_HOST =', process.env.SMTP_HOST);
console.log('SMTP_PORT =', process.env.SMTP_PORT);

// Route de test
app.get('/', (req, res) => {
  res.json({ message: 'API Apiculture - Backend fonctionnel' });
});

// Middleware de gestion des erreurs
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('Serveur demarre sur le port ' + PORT);
});
