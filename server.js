const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// Charger les variables d'environnement
dotenv.config();

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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
console.log('📍 Montage des routes...');
app.use('/api/auth', require('./routes/authRoutes'));
console.log('  ✅ /api/auth');
app.use('/api/adhesions', require('./routes/adhesionRoutes'));
console.log('  ✅ /api/adhesions');
app.use('/api/payment', require('./routes/paymentRoutes'));
console.log('  ✅ /api/payment');
app.use('/api/parametres', require('./routes/parametreRoutes'));
console.log('  ✅ /api/parametres');
app.use('/api/settings', require('./routes/settingsRoutes'));
console.log('  ✅ /api/settings');
app.use('/api/files', require('./routes/filesRoutes'));
console.log('  ✅ /api/files');
app.use('/api/actualites', require('./routes/blogRoutes'));
console.log('  ✅ /api/actualites');
app.use('/api/preferences', require('./routes/preferenceRoutes'));
console.log('  ✅ /api/preferences');
app.use('/api/communications', require('./routes/communicationRoutes'));
console.log('  ✅ /api/communications');
app.use('/api/organismes', require('./routes/organismeRoutes'));
console.log('  ✅ /api/organismes');
app.use('/api/admin-management', require('./routes/adminManagementRoutes'));
console.log('  ✅ /api/admin-management');
app.use('/api/users', require('./routes/superAdminRoutes'));
console.log('  ✅ /api/users');
app.use('/api/permissions', require('./routes/permissionRoutes'));
console.log('  ✅ /api/permissions');

// Servir les fichiers statiques pour les uploads
app.use('/uploads', express.static('uploads'));

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
