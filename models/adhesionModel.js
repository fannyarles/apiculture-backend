const mongoose = require('mongoose');

const adhesionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organisme: {
      type: String,
      enum: ['SAR', 'AMAIR'],
      required: [true, "L'organisme est requis"],
    },
    annee: {
      type: Number,
      required: [true, "L'année est requise"],
    },
    // Informations apicoles
    napi: {
      type: String,
      required: false, // Optionnel car peut être rempli plus tard
    },
    nombreRuches: {
      type: Number,
      required: false, // Optionnel car peut être rempli plus tard
      min: 1,
    },
    // Paiement
    paiement: {
      montant: {
        type: Number,
        required: true,
      },
      status: {
        type: String,
        enum: ['non_demande', 'demande', 'paye', 'refuse'],
        default: 'non_demande',
      },
      datePaiement: {
        type: Date,
      },
      stripeSessionId: {
        type: String,
      },
      stripePaymentIntentId: {
        type: String,
      },
    },
    // Statut de l'adhésion
    status: {
      type: String,
      enum: ['en_attente', 'paiement_demande', 'actif', 'refuse', 'expiree'],
      default: 'en_attente',
    },
    // Notes admin
    notes: {
      type: String,
    },
    // Date de validation
    dateValidation: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour recherche rapide
adhesionSchema.index({ user: 1, annee: 1, organisme: 1 });

module.exports = mongoose.model('Adhesion', adhesionSchema);
