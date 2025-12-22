const mongoose = require('mongoose');

const fileSchema = mongoose.Schema(
  {
    nom: {
      type: String,
      required: true,
    },
    nomOriginal: {
      type: String,
      required: true,
    },
    s3Key: {
      type: String,
      required: true,
      unique: true,
    },
    s3Bucket: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    taille: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: [
        'piece_identite',
        'kbis',
        'attestation_assurance',
        'certificat_sanitaire',
        'bulletin_adhesion',
        'attestation_adhesion',
        'declaration_ruches',
        'autre'
      ],
      required: true,
    },
    organisme: {
      type: String,
      enum: ['SAR', 'AMAIR', 'commun'],
      default: 'commun',
    },
    adhesion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Adhesion',
      required: false,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    statut: {
      type: String,
      enum: ['actif', 'supprime', 'archive'],
      default: 'actif',
    },
  },
  {
    timestamps: true,
  }
);

// Index pour recherche rapide
fileSchema.index({ adhesion: 1, statut: 1 });
fileSchema.index({ uploadedBy: 1 });
fileSchema.index({ s3Key: 1 });

module.exports = mongoose.model('File', fileSchema);
