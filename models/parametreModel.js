const mongoose = require('mongoose');

const parametreSchema = mongoose.Schema(
  {
    organisme: {
      type: String,
      enum: ['SAR', 'AMAIR'],
      required: true,
    },
    annee: {
      type: Number,
      required: true,
    },
    tarifs: {
      SAR: {
        base: {
          type: Number,
          required: true,
          default: 28,
        },
        droitEntree: {
          type: Number,
          required: true,
          default: 7,
        },
        cotisationParRuche: {
          type: Number,
          required: true,
          default: 0.25,
        }
      },
      AMAIR: {
        base: {
          type: Number,
          required: true,
          default: 50,
        }
      },
    },
    adhesionsOuvertes: {
      type: Boolean,
      default: false, // Fermées par défaut pour l'année N+1
    },
    estAnneeEnCours: {
      type: Boolean,
      default: false,
    },
    dateCreation: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index composé pour garantir un seul document par organisme et par année
parametreSchema.index({ organisme: 1, annee: 1 }, { unique: true });

// Méthode pour vérifier si c'est l'année en cours
parametreSchema.methods.isCurrentYear = function() {
  return this.annee === new Date().getFullYear();
};

// Méthode pour vérifier si c'est l'année prochaine
parametreSchema.methods.isNextYear = function() {
  return this.annee === new Date().getFullYear() + 1;
};

module.exports = mongoose.model('Parametre', parametreSchema);
