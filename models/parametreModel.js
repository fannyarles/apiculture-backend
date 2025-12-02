const mongoose = require('mongoose');

const parametreSchema = mongoose.Schema(
  {
    annee: {
      type: Number,
      required: true,
      unique: true,
    },
    tarifsSAR: {
      loisir: {
        type: Number,
        required: true,
        default: 30,
      },
      professionnel: {
        type: Number,
        required: true,
        default: 50,
      },
    },
    tarifsAMAIR: {
      loisir: {
        type: Number,
        required: true,
        default: 25,
      },
      professionnel: {
        type: Number,
        required: true,
        default: 45,
      },
    },
    dateDebutAdhesions: {
      type: Date,
      required: true,
    },
    dateFinAdhesions: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Parametre', parametreSchema);
