const asyncHandler = require('express-async-handler');
const Preference = require('../models/preferenceModel');

// @desc    Obtenir les préférences de l'utilisateur
// @route   GET /api/preferences
// @access  Private
const getPreferences = asyncHandler(async (req, res) => {
  let preferences = await Preference.findOne({ user: req.user._id });

  // Si aucune préférence n'existe, créer avec les valeurs par défaut
  if (!preferences) {
    preferences = await Preference.create({
      user: req.user._id,
      communications: {
        mesGroupements: true,
        autresGroupements: false,
        alertesSanitaires: true,
      },
    });
  }

  res.json(preferences);
});

// @desc    Mettre à jour les préférences de l'utilisateur
// @route   PUT /api/preferences
// @access  Private
const updatePreferences = asyncHandler(async (req, res) => {
  const { communications } = req.body;

  let preferences = await Preference.findOne({ user: req.user._id });

  if (!preferences) {
    // Créer si n'existe pas
    preferences = await Preference.create({
      user: req.user._id,
      communications,
    });
  } else {
    // Mettre à jour
    preferences.communications = communications;
    await preferences.save();
  }

  res.json(preferences);
});

module.exports = {
  getPreferences,
  updatePreferences,
};
