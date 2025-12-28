const mongoose = require('mongoose');

const membreConseilSchema = mongoose.Schema(
  {
    adherent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organisme: {
      type: String,
      required: true,
      enum: ['SAR', 'AMAIR'],
    },
    // Types de membre
    estConseil: {
      type: Boolean,
      default: false,
    },
    estBureau: {
      type: Boolean,
      default: false,
    },
    estCoopte: {
      type: Boolean,
      default: false, // Uniquement pour AMAIR
    },
    estMembreDeDroit: {
      type: Boolean,
      default: false, // Président SAR = membre de droit CA AMAIR
    },
    // Fraction (quarts pour SAR, tiers pour AMAIR)
    fraction: {
      type: String,
      enum: [
        // SAR
        '1er_quart', '2e_quart', '3e_quart', '4e_quart',
        // AMAIR
        '1er_tiers', '2e_tiers', '3e_tiers',
      ],
    },
    // Fonction (si membre du bureau)
    fonction: {
      type: String,
      enum: [
        'president',
        'vice_president',
        'secretaire',
        'secretaire_adjoint',
        'tresorier',
        'tresorier_adjoint',
      ],
    },
    // Réunion lors de laquelle l'élection a eu lieu
    reunionElection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reunion',
    },
    // Date de cooptation (pour les membres cooptés AMAIR)
    dateCooptation: {
      type: Date,
    },
    // Statut
    actif: {
      type: Boolean,
      default: true,
    },
    // Informations de retrait (si plus actif)
    dateRetrait: {
      type: Date,
    },
    raisonRetrait: {
      type: String,
      enum: ['demission', 'non_adhesion', 'fin_mandat', 'autre'],
    },
    raisonRetraitAutre: {
      type: String,
    },
    reunionRetrait: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reunion',
    },
  },
  {
    timestamps: true,
  }
);

// Index pour recherche rapide
membreConseilSchema.index({ organisme: 1, actif: 1 });
membreConseilSchema.index({ adherent: 1, organisme: 1 });

// Méthode statique pour obtenir les fractions par organisme
membreConseilSchema.statics.getFractions = function(organisme) {
  if (organisme === 'SAR') {
    return [
      { value: '1er_quart', label: '1er quart' },
      { value: '2e_quart', label: '2e quart' },
      { value: '3e_quart', label: '3e quart' },
      { value: '4e_quart', label: '4e quart' },
    ];
  } else if (organisme === 'AMAIR') {
    return [
      { value: '1er_tiers', label: '1er tiers' },
      { value: '2e_tiers', label: '2e tiers' },
      { value: '3e_tiers', label: '3e tiers' },
    ];
  }
  return [];
};

// Méthode statique pour obtenir les fonctions du bureau
membreConseilSchema.statics.getFonctions = function() {
  return [
    { value: 'president', label: 'Président' },
    { value: 'vice_president', label: 'Vice-président' },
    { value: 'secretaire', label: 'Secrétaire' },
    { value: 'secretaire_adjoint', label: 'Secrétaire-adjoint' },
    { value: 'tresorier', label: 'Trésorier' },
    { value: 'tresorier_adjoint', label: 'Trésorier-adjoint' },
  ];
};

const MembreConseil = mongoose.model('MembreConseil', membreConseilSchema);

module.exports = MembreConseil;
