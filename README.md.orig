<<<<<<< HEAD
# Backend - Application de gestion d'adhésions Apiculture

## 🚀 Installation

### 1. Installer les dépendances
```bash
cd backend
npm install
```

### 2. Configurer les variables d'environnement

Créer un fichier `.env` à la racine du dossier backend :

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/apiculture

# JWT
JWT_SECRET=votre_secret_jwt_tres_securise

# Server
PORT=5000
NODE_ENV=development

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_votre_cle_secrete
STRIPE_PUBLIC_KEY=pk_test_votre_cle_publique
STRIPE_WEBHOOK_SECRET=whsec_votre_webhook_secret

# SMTP Configuration (Brevo)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=9c8310001@smtp-brevo.com
SMTP_PASS=xsmtpsib-98d41ea8cd0fe59adc09bcc34cbaae69eb753e313fa6a4a075ec313a43eef179-pB0XEclfQgXz25jG
EMAIL_FROM=noreply@apiculture.fr
```

### 3. Démarrer MongoDB

Assurez-vous que MongoDB est installé et en cours d'exécution :

```bash
# Windows
mongod

# Linux/Mac
sudo systemctl start mongodb
```

### 4. Démarrer le serveur

```bash
# Mode développement (avec nodemon)
npm run dev

# Mode production
npm start
```

Le serveur démarre sur `http://localhost:5000`

## 📁 Structure du projet

```
backend/
├── config/
│   └── db.js                 # Configuration MongoDB
├── controllers/
│   ├── authController.js     # Gestion authentification
│   ├── adhesionController.js # Gestion adhésions
│   ├── paymentController.js  # Gestion paiements Stripe
│   └── parametreController.js # Gestion paramètres
├── middleware/
│   ├── authMiddleware.js     # Protection routes & vérification admin
│   └── errorMiddleware.js    # Gestion erreurs
├── models/
│   ├── userModel.js          # Modèle utilisateur
│   ├── adhesionModel.js      # Modèle adhésion
│   └── parametreModel.js     # Modèle paramètres
├── routes/
│   ├── authRoutes.js         # Routes authentification
│   ├── adhesionRoutes.js     # Routes adhésions
│   ├── paymentRoutes.js      # Routes paiement
│   └── parametreRoutes.js    # Routes paramètres
├── .env                      # Variables d'environnement (à créer)
├── .env.example              # Exemple de configuration
├── .gitignore                # Fichiers à ignorer
├── package.json              # Dépendances
├── server.js                 # Point d'entrée
└── README.md                 # Documentation
```

## 🔑 API Endpoints

### Authentification (`/api/auth`)

| Méthode | Endpoint | Protection | Description |
|---------|----------|------------|-------------|
| POST | `/register` | Public | Inscription |
| POST | `/login` | Public | Connexion |
| GET | `/profile` | User | Profil utilisateur |
| PUT | `/profile` | User | Modifier profil |
| PUT | `/password` | User | Changer mot de passe |
| GET | `/users` | Admin | Liste utilisateurs |
| DELETE | `/users/:id` | Admin | Supprimer utilisateur |

### Adhésions (`/api/adhesions`)

| Méthode | Endpoint | Protection | Description |
|---------|----------|------------|-------------|
| POST | `/` | User | Créer adhésion |
| GET | `/my` | User | Mes adhésions |
| GET | `/:id` | User | Détails adhésion |
| GET | `/` | Admin | Toutes les adhésions |
| PUT | `/:id/status` | Admin | Modifier statut |
| POST | `/:id/request-payment` | Admin | Demander paiement |
| DELETE | `/:id` | Admin | Supprimer adhésion |
| GET | `/stats/summary` | Admin | Statistiques |

### Paiement (`/api/payment`)

| Méthode | Endpoint | Protection | Description |
|---------|----------|------------|-------------|
| POST | `/create-session/:adhesionId` | User | Créer session Stripe |
| GET | `/session/:sessionId` | User | Statut session |
| POST | `/webhook` | Public | Webhook Stripe |

### Paramètres (`/api/parametres`)

| Méthode | Endpoint | Protection | Description |
|---------|----------|------------|-------------|
| GET | `/` | Public | Tous les paramètres |
| GET | `/active` | Public | Paramètres actifs |
| GET | `/:annee` | Public | Paramètres par année |
| POST | `/` | Admin | Créer paramètres |
| PUT | `/:id` | Admin | Modifier paramètres |
| DELETE | `/:id` | Admin | Supprimer paramètres |
| PUT | `/:id/toggle-active` | Admin | Activer/Désactiver |

## 🔐 Sécurité

- **JWT** : Authentification par token
- **bcrypt** : Hash des mots de passe
- **CORS** : Protection cross-origin
- **Validation** : Vérification des données
- **Middleware** : Protection des routes sensibles

## 📧 Configuration Email (SMTP)

Le système utilise **Brevo** (anciennement Sendinblue) pour l'envoi d'emails :

- Demande de paiement
- Confirmation de paiement
- Notifications admin

Les identifiants SMTP sont déjà configurés dans l'exemple `.env`.

## 💳 Configuration Stripe

### Mode Test

Pour tester les paiements, utilisez les clés de test Stripe :

**Cartes de test :**
- Succès : `4242 4242 4242 4242`
- Échec : `4000 0000 0000 0002`

**Webhook local (développement) :**

1. Installer Stripe CLI : https://stripe.com/docs/stripe-cli
2. Se connecter : `stripe login`
3. Écouter les webhooks :
```bash
stripe listen --forward-to localhost:5000/api/payment/webhook
```
4. Copier le webhook secret dans `.env`

## 🗄️ Base de données

### Modèles

**User**
- Informations personnelles
- Adresse
- Rôle (user/admin)
- Authentification

**Adhesion**
- Référence utilisateur
- Organisme (SAR/AMAIR)
- Année
- Informations apicoles (NAPI, ruches)
- Assurance
- Paiement
- Statut

**Parametre**
- Année
- Tarifs SAR/AMAIR
- Dates d'adhésion
- Activation

### Créer un admin

Après inscription, modifier manuellement dans MongoDB :

```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

## 🧪 Tests

### Test de l'API

```bash
# Vérifier que le serveur fonctionne
curl http://localhost:5000

# Tester l'inscription
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "prenom": "John",
    "nom": "Doe",
    "email": "john@example.com",
    "password": "password123",
    "telephone": "0612345678",
    "addresse": {
      "rue": "1 rue Test",
      "codePostal": "75001",
      "ville": "Paris"
    }
  }'
```

## 🐛 Dépannage

### Erreur de connexion MongoDB

```
❌ Erreur MongoDB: connect ECONNREFUSED
```

**Solution :** Vérifier que MongoDB est démarré

### Erreur SMTP

```
Error: Invalid login
```

**Solution :** Vérifier les identifiants SMTP dans `.env`

### Erreur Stripe

```
No API key provided
```

**Solution :** Vérifier `STRIPE_SECRET_KEY` dans `.env`

## 📝 Logs

Les logs sont affichés dans la console :

- ✅ Succès (vert)
- ❌ Erreurs (rouge)
- 🚀 Démarrage serveur
- 📧 Envoi emails
- 💳 Paiements

## 🔄 Workflow complet

1. **Utilisateur s'inscrit** → Compte créé
2. **Utilisateur crée adhésion** → Statut "en_attente"
3. **Admin valide** → Statut "validee"
4. **Admin demande paiement** → Email envoyé, statut "attente_paiement"
5. **Utilisateur paie** → Stripe traite le paiement
6. **Webhook confirme** → Statut "actif", email de confirmation
7. **Adhésion active** → Utilisateur peut consulter

## 📚 Documentation supplémentaire

- [Stripe Documentation](https://stripe.com/docs)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Guide](https://expressjs.com/)
- [Nodemailer Guide](https://nodemailer.com/)

## 🆘 Support

En cas de problème, vérifier :

1. MongoDB est démarré
2. Variables d'environnement correctes
3. Dépendances installées (`npm install`)
4. Port 5000 disponible
5. Logs dans la console

---

**Version :** 1.0.0  
**Dernière mise à jour :** Décembre 2024
=======
0
>>>>>>> 000969eebd7ad870f3164b13e0a885b620cef2d9
