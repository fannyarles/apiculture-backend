const mongoose = require('mongoose');

const communicationSchema = mongoose.Schema(
  {
    titre: {
      type: String,
      required: [true, 'Le titre est requis'],
      trim: true,
    },
    contenu: {
      type: String,
      required: [true, 'Le contenu est requis'],
    },
    auteur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organisme: {
      type: String,
      required: true,
      enum: ['SAR', 'AMAIR'],
    },
    statut: {
      type: String,
      required: true,
      enum: ['brouillon', 'programme', 'envoye'],
      default: 'brouillon',
    },
    estSanitaire: {
      type: Boolean,
      default: false,
    },
    destinataires: {
      type: String,
      required: true,
      enum: ['mon_groupement', 'tous_groupements', 'SAR', 'AMAIR'],
      default: 'mon_groupement',
    },
    dateEnvoi: {
      type: Date,
    },
    dateProgrammee: {
      type: Date,
    },
    emailsEnvoyes: {
      type: Number,
      default: 0,
    },
    emailsEchoues: {
      type: Number,
      default: 0,
    },
    erreurs: [
      {
        email: String,
        erreur: String,
        date: Date,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index pour les requêtes fréquentes
communicationSchema.index({ statut: 1, dateProgrammee: 1 });
communicationSchema.index({ organisme: 1, statut: 1 });
communicationSchema.index({ auteur: 1 });

module.exports = mongoose.model('Communication', communicationSchema);
