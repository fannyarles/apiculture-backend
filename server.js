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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/adhesions', require('./routes/adhesionRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/parametres', require('./routes/parametreRoutes'));

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
