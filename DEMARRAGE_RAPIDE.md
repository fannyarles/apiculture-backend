# 🚀 Démarrage Rapide - Backend

## ⚡ Installation en 3 étapes

### 1️⃣ Installer les dépendances
```bash
cd backend
npm install
```

### 2️⃣ Configurer l'environnement
```bash
# Copier le fichier de configuration
copy .env.example .env

# Modifier .env et changer au minimum :
# JWT_SECRET=votre_secret_tres_securise_changez_moi
```

### 3️⃣ Démarrer
```bash
# Démarrer MongoDB
net start MongoDB

# Démarrer le serveur
npm run dev
```

**✅ Le serveur est maintenant accessible sur http://localhost:5000**

---

## 🎯 Configuration Minimale

Le fichier `.env` doit contenir au minimum :

```env
MONGO_URI=mongodb://localhost:27017/apiculture
JWT_SECRET=changez_cette_valeur_par_quelque_chose_de_securise
PORT=5000
FRONTEND_URL=http://localhost:3000
```

**Note :** Les identifiants SMTP (Brevo) sont déjà configurés dans `.env.example` et fonctionnels.

---

## 🧪 Test Rapide

Ouvrir dans le navigateur : **http://localhost:5000**

Vous devriez voir :
```json
{
  "message": "API Apiculture - Backend fonctionnel"
}
```

---

## 👤 Créer un Administrateur

### Méthode 1 : Via MongoDB Shell
```bash
# Ouvrir MongoDB shell
mongosh

# Utiliser la base de données
use apiculture

# Mettre à jour le rôle d'un utilisateur
db.users.updateOne(
  { email: "votre_email@example.com" },
  { $set: { role: "admin" } }
)
```

### Méthode 2 : Via MongoDB Compass
1. Ouvrir MongoDB Compass
2. Se connecter à `mongodb://localhost:27017`
3. Sélectionner la base `apiculture`
4. Ouvrir la collection `users`
5. Trouver votre utilisateur
6. Modifier le champ `role` de `"user"` à `"admin"`

---

## 📋 Créer les Paramètres Annuels

Via MongoDB Shell :
```javascript
use apiculture

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

---

## 🔧 Commandes Utiles

```bash
# Démarrer en mode développement (avec auto-reload)
npm run dev

# Démarrer en mode production
npm start

# Vérifier MongoDB
net start MongoDB

# Arrêter MongoDB
net stop MongoDB

# Voir les logs en temps réel
# Les logs s'affichent directement dans le terminal
```

---

## 🐛 Problèmes Courants

### ❌ "Cannot connect to MongoDB"
**Solution :** Démarrer MongoDB
```bash
net start MongoDB
```

### ❌ "Port 5000 already in use"
**Solution :** Changer le port dans `.env`
```env
PORT=5001
```

### ❌ "Cannot find module"
**Solution :** Réinstaller les dépendances
```bash
rm -rf node_modules
npm install
```

---

## 📚 Documentation Complète

- **README.md** - Documentation API complète
- **INSTALLATION.md** - Guide d'installation détaillé
- **VERIFICATION.md** - Checklist de vérification
- **BACKEND_RESTAURATION_COMPLETE.md** - Récapitulatif complet

---

## ✅ Checklist Rapide

- [ ] Node.js installé
- [ ] MongoDB installé et démarré
- [ ] Dépendances installées (`npm install`)
- [ ] Fichier `.env` créé et configuré
- [ ] Serveur démarre sans erreur
- [ ] API accessible sur http://localhost:5000
- [ ] Compte admin créé
- [ ] Paramètres annuels créés

---

## 🎉 C'est Parti !

Une fois ces étapes complétées, votre backend est **100% opérationnel** !

Vous pouvez maintenant :
- ✅ Créer des comptes utilisateurs
- ✅ Gérer les adhésions
- ✅ Traiter les paiements Stripe
- ✅ Envoyer des emails automatiques
- ✅ Administrer l'application

**Bon développement ! 🚀**
