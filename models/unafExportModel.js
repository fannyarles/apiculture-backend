const mongoose = require('mongoose');

const unafExportSchema = mongoose.Schema(
  {
    // Date de l'export (une des 15 dates définies)
    dateExport: {
      type: Date,
      required: true,
    },
    // Année de la campagne
    annee: {
      type: Number,
      required: true,
    },
    // Est-ce le premier export de l'année ?
    isFirstExport: {
      type: Boolean,
      default: false,
    },
    // Fichier principal (nouvelles souscriptions)
    fichierPrincipal: {
      s3Url: String,
      s3Key: String,
      fileName: String,
      nombrePaiements: { type: Number, default: 0 },
      montantTotal: { type: Number, default: 0 },
    },
    // Fichier complémentaire (modifications)
    fichierComplement: {
      s3Url: String,
      s3Key: String,
      fileName: String,
      nombrePaiements: { type: Number, default: 0 },
      montantTotal: { type: Number, default: 0 },
    },
    // DEPRECATED - Garder pour compatibilité avec anciens exports
    s3Url: {
      type: String,
    },
    s3Key: {
      type: String,
    },
    nombrePaiements: {
      type: Number,
      default: 0,
    },
    montantTotal: {
      type: Number,
      default: 0,
    },
    // IDs des services inclus (paiements initiaux)
    servicesInclus: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
    }],
    // Modifications incluses (serviceId + index de la modification)
    modificationsIncluses: [{
      serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
      },
      modificationIndex: {
        type: Number,
      },
    }],
    // Statut de l'export
    status: {
      type: String,
      enum: ['genere', 'envoye', 'erreur'],
      default: 'genere',
    },
    // Notes ou erreurs
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour rechercher par année et date
unafExportSchema.index({ annee: 1, dateExport: 1 });

module.exports = mongoose.model('UNAFExport', unafExportSchema);
