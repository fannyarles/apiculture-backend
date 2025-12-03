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

// Route de test
app.get('/', (req, res) => {
  res.json({ message: 'API Apiculture - Backend fonctionnel' });
});

// Middleware de gestion des erreurs
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('Serveur demarre sur le port ' + PORT);
});
