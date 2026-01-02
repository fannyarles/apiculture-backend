const mongoose = require('mongoose');

const notificationSettingsSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    // Catégorie Adhésions
    adhesions: {
      suiviAdhesions: {
        type: Boolean,
        default: false,
        description: 'Recevoir une notification lors d\'une nouvelle demande d\'adhésion ou d\'un paiement reçu pour mes groupements',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Méthode pour vérifier si un utilisateur a une notification activée
notificationSettingsSchema.methods.hasNotification = function (category, notificationKey) {
  if (!this[category]) return false;
  return this[category][notificationKey] === true;
};

// Méthode statique pour créer des paramètres de notification par défaut
notificationSettingsSchema.statics.createDefaultSettings = async function (userId) {
  const defaultSettings = {
    userId,
    adhesions: {
      suiviAdhesions: false,
    },
  };

  return await this.create(defaultSettings);
};

// Méthode statique pour obtenir ou créer les paramètres d'un utilisateur
notificationSettingsSchema.statics.getOrCreate = async function (userId) {
  let settings = await this.findOne({ userId });
  if (!settings) {
    settings = await this.createDefaultSettings(userId);
  }
  return settings;
};

module.exports = mongoose.model('NotificationSettings', notificationSettingsSchema);
