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
      required: [true, 'Le numéro NAPI est requis'],
    },
    nombreRuches: {
      type: Number,
      required: [true, 'Le nombre de ruches est requis'],
      min: 1,
    },
    typeApiculture: {
      type: String,
      enum: ['loisir', 'professionnel'],
      required: true,
    },
    // Assurance
    assurance: {
      compagnie: { type: String, required: true },
      numeroPolice: { type: String, required: true },
      dateExpiration: { type: Date, required: true },
    },
    // Paiement
    paiement: {
      montant: {
        type: Number,
        required: true,
      },
      status: {
        type: String,
        enum: ['en_attente', 'attente_paiement', 'paye', 'refuse'],
        default: 'en_attente',
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
      enum: ['en_attente', 'validee', 'actif', 'refuse', 'expiree'],
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
