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
    // URL du fichier sur S3
    s3Url: {
      type: String,
      required: true,
    },
    // Clé S3 pour suppression éventuelle
    s3Key: {
      type: String,
      required: true,
    },
    // Nombre de paiements inclus dans cet export
    nombrePaiements: {
      type: Number,
      default: 0,
    },
    // Montant total des paiements
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
