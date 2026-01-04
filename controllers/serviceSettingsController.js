const asyncHandler = require('express-async-handler');
const ServiceSettings = require('../models/serviceSettingsModel');

// @desc    Récupérer les paramètres des services
// @route   GET /api/service-settings
// @access  Public
const getServiceSettings = asyncHandler(async (req, res) => {
  let settings = await ServiceSettings.findOne({ key: 'global' });

  // Créer les paramètres par défaut s'ils n'existent pas
  if (!settings) {
    settings = await ServiceSettings.create({
      key: 'global',
      miellerieActif: true,
      unafActif: true,
    });
  }

  res.json({
    miellerieActif: settings.miellerieActif,
    unafActif: settings.unafActif,
  });
});

// @desc    Mettre à jour les paramètres des services
// @route   PUT /api/service-settings
// @access  Private/SuperAdmin
const updateServiceSettings = asyncHandler(async (req, res) => {
  // Vérification super_admin
  if (req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Accès réservé au super administrateur');
  }

  const { miellerieActif, unafActif } = req.body;

  let settings = await ServiceSettings.findOne({ key: 'global' });

  if (!settings) {
    settings = await ServiceSettings.create({
      key: 'global',
      miellerieActif: miellerieActif !== undefined ? miellerieActif : true,
      unafActif: unafActif !== undefined ? unafActif : true,
    });
  } else {
    if (miellerieActif !== undefined) {
      settings.miellerieActif = miellerieActif;
    }
    if (unafActif !== undefined) {
      settings.unafActif = unafActif;
    }
    await settings.save();
  }

  res.json({
    miellerieActif: settings.miellerieActif,
    unafActif: settings.unafActif,
    message: 'Paramètres des services mis à jour',
  });
});

// @desc    Toggle l'activation d'un service
// @route   PUT /api/service-settings/toggle/:service
// @access  Private/SuperAdmin
const toggleService = asyncHandler(async (req, res) => {
  // Vérification super_admin
  if (req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Accès réservé au super administrateur');
  }

  const { service } = req.params;

  if (!['miellerie', 'unaf'].includes(service)) {
    res.status(400);
    throw new Error('Service invalide. Utilisez "miellerie" ou "unaf"');
  }

  let settings = await ServiceSettings.findOne({ key: 'global' });

  if (!settings) {
    settings = await ServiceSettings.create({
      key: 'global',
      miellerieActif: true,
      unafActif: true,
    });
  }

  if (service === 'miellerie') {
    settings.miellerieActif = !settings.miellerieActif;
  } else if (service === 'unaf') {
    settings.unafActif = !settings.unafActif;
  }

  await settings.save();

  const serviceName = service === 'miellerie' ? 'Miellerie' : 'Services UNAF';
  const isActive = service === 'miellerie' ? settings.miellerieActif : settings.unafActif;

  res.json({
    miellerieActif: settings.miellerieActif,
    unafActif: settings.unafActif,
    message: `Service ${serviceName} ${isActive ? 'activé' : 'désactivé'}`,
  });
});

module.exports = {
  getServiceSettings,
  updateServiceSettings,
  toggleService,
};
