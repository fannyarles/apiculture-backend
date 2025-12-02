# 🚀 Guide d'installation du Backend

## Étape 1 : Installer les dépendances

```bash
cd backend
npm install
```

## Étape 2 : Créer le fichier .env

Créez un fichier `.env` à la racine du dossier backend avec le contenu suivant :

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/apiculture

# JWT
JWT_SECRET=votre_secret_jwt_tres_securise_changez_moi

# Server
PORT=5000
NODE_ENV=development

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_votre_cle_secrete
STRIPE_PUBLIC_KEY=pk_test_votre_cle_publique
STRIPE_WEBHOOK_SECRET=whsec_votre_webhook_secret

# SMTP Configuration (Brevo - déjà configuré)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=9c8310001@smtp-brevo.com
SMTP_PASS=xsmtpsib-98d41ea8cd0fe59adc09bcc34cbaae69eb753e313fa6a4a075ec313a43eef179-pB0XEclfQgXz25jG
EMAIL_FROM=noreply@apiculture.fr
```

## Étape 3 : Démarrer MongoDB

### Windows
```bash
# Démarrer MongoDB (si installé en tant que service)
net start MongoDB

# Ou démarrer manuellement
mongod
```

### Linux/Mac
```bash
sudo systemctl start mongodb
```

## Étape 4 : Démarrer le serveur

```bash
# Mode développement (avec auto-reload)
npm run dev

# Mode production
npm start
```

Le serveur démarre sur **http://localhost:5000**

## Étape 5 : Créer un compte administrateur

1. Démarrez le serveur
2. Inscrivez-vous via l'interface frontend ou via API
3. Connectez-vous à MongoDB et modifiez le rôle :

```bash
# Ouvrir MongoDB shell
mongosh

# Utiliser la base de données
use apiculture

# Mettre à jour le rôle de l'utilisateur
db.users.updateOne(
  { email: "votre_email@example.com" },
  { $set: { role: "admin" } }
)
```

## Étape 6 : Créer les paramètres pour l'année en cours

Via l'interface admin ou via MongoDB :

```javascript
db.parametres.insertOne({
  annee: 2025,
  tarifsSAR: {
    loisir: 30,
    professionnel: 50
  },
  tarifsAMAIR: {
    loisir: 25,
    professionnel: 45
  },
  dateDebutAdhesions: new Date("2025-01-01"),
  dateFinAdhesions: new Date("2025-12-31"),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

## ✅ Vérification

Testez l'API :

```bash
# Vérifier que le serveur fonctionne
curl http://localhost:5000

# Devrait retourner :
# {"message":"API Apiculture - Backend fonctionnel"}
```

## 🔧 Configuration Stripe (optionnel pour les tests)

### Mode Test

1. Créer un compte sur [https://stripe.com](https://stripe.com)
2. Récupérer les clés de test dans le Dashboard
3. Mettre à jour `.env` avec vos clés

### Webhook local (développement)

```bash
# Installer Stripe CLI
# https://stripe.com/docs/stripe-cli

# Se connecter
stripe login

# Écouter les webhooks
stripe listen --forward-to localhost:5000/api/payment/webhook

# Copier le webhook secret affiché et le mettre dans .env
```

## 🐛 Dépannage

### Erreur : Cannot connect to MongoDB

**Solution :** Vérifiez que MongoDB est démarré
```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl status mongodb
```

### Erreur : Port 5000 already in use

**Solution :** Changez le port dans `.env`
```env
PORT=5001
```

### Erreur : Invalid SMTP credentials

**Solution :** Les identifiants SMTP Brevo sont déjà configurés dans l'exemple. Si vous voulez utiliser votre propre compte, créez-en un sur [https://www.brevo.com](https://www.brevo.com)

## 📚 Prochaines étapes

1. ✅ Backend installé et fonctionnel
2. ➡️ Installer et configurer le frontend
3. ➡️ Créer un compte admin
4. ➡️ Configurer les paramètres annuels
5. ➡️ Tester le flux complet d'adhésion

---

**Besoin d'aide ?** Consultez le fichier `README.md` pour plus de détails.
