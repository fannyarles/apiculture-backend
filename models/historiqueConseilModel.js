const mongoose = require('mongoose');

const historiqueConseilSchema = mongoose.Schema(
  {
    // Référence au membre concerné
    membreConseil: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MembreConseil',
    },
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
    // Type d'action
    action: {
      type: String,
      required: true,
      enum: ['ajout', 'retrait', 'modification'],
    },
    // Détails du poste
    typePoste: {
      type: String,
      enum: ['conseil', 'bureau', 'coopte', 'membre_de_droit'],
    },
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
    fraction: {
      type: String,
    },
    // Réunion liée (pour élection ou retrait)
    reunion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reunion',
    },
    // Date de cooptation (si membre coopté)
    dateCooptation: {
      type: Date,
    },
    // Raison du retrait
    raisonRetrait: {
      type: String,
      enum: ['demission', 'non_adhesion', 'fin_mandat', 'autre'],
    },
    raisonRetraitAutre: {
      type: String,
    },
    // Données avant modification (pour action 'modification')
    anciennesDonnees: {
      type: mongoose.Schema.Types.Mixed,
    },
    // Données après modification (pour action 'modification')
    nouvellesDonnees: {
      type: mongoose.Schema.Types.Mixed,
    },
    // Qui a fait la modification
    modifiePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Commentaire optionnel
    commentaire: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour recherche rapide
historiqueConseilSchema.index({ organisme: 1, createdAt: -1 });
historiqueConseilSchema.index({ adherent: 1 });
historiqueConseilSchema.index({ membreConseil: 1 });

const HistoriqueConseil = mongoose.model('HistoriqueConseil', historiqueConseilSchema);

module.exports = HistoriqueConseil;
