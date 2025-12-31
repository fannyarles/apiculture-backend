const mongoose = require('mongoose');

const reunionSchema = mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'La date est requise'],
    },
    heureDebut: {
      type: String,
      trim: true,
    },
    heureFin: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Le type de réunion est requis'],
      enum: ['assemblee_generale', 'conseil_syndical'],
    },
    lieu: {
      type: String,
      required: [true, 'Le lieu est requis'],
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    ordresDuJour: {
      type: String,
      trim: true,
    },
    organisme: {
      type: String,
      required: true,
      enum: ['SAR', 'AMAIR'],
    },
    documents: [
      {
        nom: {
          type: String,
          required: true,
        },
        nomOriginal: {
          type: String,
          required: true,
        },
        key: {
          type: String,
          required: true,
        },
        url: {
          type: String,
        },
        type: {
          type: String,
        },
        taille: {
          type: Number,
        },
        dateAjout: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    creePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    modifiePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    dateConvocation: {
      type: Date,
      default: null,
    },
    // Liste des membres convoqués avec leur statut de présence
    presences: [
      {
        membre: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'MembreConseil',
        },
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        // Snapshot des informations pour historique
        nom: String,
        prenom: String,
        email: String,
        fonction: String,
        estBureau: Boolean,
        estConseil: Boolean,
        // Statut de présence
        statut: {
          type: String,
          enum: ['present', 'absent', 'excuse'],
          default: 'absent',
        },
      },
    ],
    // Document de convocation généré
    convocationPdf: {
      nom: String,
      key: String,
      url: String,
      dateGeneration: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour les requêtes fréquentes
reunionSchema.index({ organisme: 1, date: -1 });
reunionSchema.index({ type: 1 });

// Méthode pour obtenir le libellé du type
reunionSchema.methods.getTypeLabel = function () {
  const labels = {
    assemblee_generale: 'Assemblée Générale',
    conseil_syndical: 'Conseil Syndical',
  };
  return labels[this.type] || this.type;
};

module.exports = mongoose.model('Reunion', reunionSchema);
