const mongoose = require('mongoose');

const preferenceSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    communications: {
      mesGroupements: {
        type: Boolean,
        default: true,
      },
      autresGroupements: {
        type: Boolean,
        default: false,
      },
      alertesSanitaires: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Preference', preferenceSchema);
