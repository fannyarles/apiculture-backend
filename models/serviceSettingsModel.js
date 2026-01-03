const mongoose = require('mongoose');

const serviceSettingsSchema = mongoose.Schema(
  {
    // Identifiant unique (on n'aura qu'un seul document)
    key: {
      type: String,
      default: 'global',
      unique: true,
    },
    // Activation du service Miellerie
    miellerieActif: {
      type: Boolean,
      default: true,
    },
    // Activation du service Assurance UNAF
    unafActif: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ServiceSettings', serviceSettingsSchema);
