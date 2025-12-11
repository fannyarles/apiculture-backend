const mongoose = require('mongoose');

const organismeSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom de l\'organisme est requis'],
      trim: true,
    },
    acronyme: {
      type: String,
      required: [true, 'L\'acronyme est requis'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    adresse: {
      rue: {
        type: String,
        required: true,
      },
      codePostal: {
        type: String,
        required: true,
      },
      ville: {
        type: String,
        required: true,
      },
    },
    telephone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    siteWeb: {
      type: String,
      trim: true,
    },
    logo: {
      type: String, // URL du logo
    },
    description: {
      type: String,
    },
    actif: {
      type: Boolean,
      default: true,
    },
    // Informations complémentaires
    siret: {
      type: String,
    },
    president: {
      nom: String,
      email: String,
      telephone: String,
    },
    // Statistiques
    nombreAdherents: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour recherche rapide
organismeSchema.index({ acronyme: 1 });
organismeSchema.index({ nom: 'text' });

const Organisme = mongoose.model('Organisme', organismeSchema);

module.exports = Organisme;
