const asyncHandler = require('express-async-handler');
const NotificationSettings = require('../models/notificationSettingsModel');
const User = require('../models/userModel');

// @desc    Obtenir les paramètres de notification d'un admin
// @route   GET /api/notification-settings/:userId
// @access  Super Admin
const getAdminNotificationSettings = asyncHandler(async (req, res) => {
  let settings = await NotificationSettings.findOne({ userId: req.params.userId });

  if (!settings) {
    // Créer des paramètres par défaut si non existants
    settings = await NotificationSettings.createDefaultSettings(req.params.userId);
  }

  res.json(settings);
});

// @desc    Créer ou mettre à jour les paramètres de notification d'un admin
// @route   PUT /api/notification-settings/:userId
// @access  Super Admin
const updateAdminNotificationSettings = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const settingsData = req.body;

  // Vérifier que l'utilisateur existe et est un admin
  const user = await User.findById(userId);
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    res.status(404);
    throw new Error('Administrateur non trouvé');
  }

  // Chercher les paramètres existants
  let settings = await NotificationSettings.findOne({ userId });

  if (settings) {
    // Mettre à jour les paramètres existants
    Object.keys(settingsData).forEach(category => {
      if (settings[category] && typeof settingsData[category] === 'object') {
        Object.keys(settingsData[category]).forEach(notifKey => {
          if (settings[category][notifKey] !== undefined) {
            settings[category][notifKey] = settingsData[category][notifKey];
          }
        });
      }
    });

    await settings.save();
  } else {
    // Créer de nouveaux paramètres
    settings = await NotificationSettings.create({
      userId,
      ...settingsData,
    });
  }

  res.json(settings);
});

// @desc    Obtenir tous les paramètres de notification
// @route   GET /api/notification-settings
// @access  Super Admin
const getAllNotificationSettings = asyncHandler(async (req, res) => {
  const settings = await NotificationSettings.find({}).populate('userId', 'prenom nom email role organismes');
  res.json(settings);
});

// @desc    Supprimer les paramètres de notification d'un admin
// @route   DELETE /api/notification-settings/:userId
// @access  Super Admin
const deleteAdminNotificationSettings = asyncHandler(async (req, res) => {
  const settings = await NotificationSettings.findOne({ userId: req.params.userId });

  if (!settings) {
    res.status(404);
    throw new Error('Paramètres de notification non trouvés');
  }

  await settings.deleteOne();
  res.json({ message: 'Paramètres de notification supprimés avec succès' });
});

// @desc    Obtenir la structure des catégories de notifications (pour l'UI)
// @route   GET /api/notification-settings/structure
// @access  Super Admin
const getNotificationSettingsStructure = asyncHandler(async (req, res) => {
  const structure = {
    adhesions: {
      label: 'Adhésions',
      icon: 'UsersIcon',
      notifications: [
        { 
          key: 'suiviAdhesions', 
          label: 'Suivi des adhésions de mes groupements', 
          description: 'Recevoir une notification par email lors d\'une nouvelle demande d\'adhésion ou d\'un paiement reçu (adhésion et services) pour les groupements auxquels vous êtes rattaché' 
        },
      ],
    },
  };

  res.json(structure);
});

// @desc    Obtenir les admins à notifier pour un événement donné
// @route   Fonction interne (non exposée via API)
const getAdminsToNotify = async (organisme, notificationType) => {
  // Récupérer tous les admins rattachés à cet organisme
  const admins = await User.find({
    role: { $in: ['admin', 'super_admin'] },
    organismes: organisme,
    isActive: true,
  });

  const adminsToNotify = [];

  for (const admin of admins) {
    const settings = await NotificationSettings.findOne({ userId: admin._id });
    
    if (settings) {
      // Vérifier si la notification est activée
      if (notificationType === 'suiviAdhesions' && settings.adhesions?.suiviAdhesions) {
        adminsToNotify.push(admin);
      }
    }
  }

  return adminsToNotify;
};

module.exports = {
  getAdminNotificationSettings,
  updateAdminNotificationSettings,
  getAllNotificationSettings,
  deleteAdminNotificationSettings,
  getNotificationSettingsStructure,
  getAdminsToNotify,
};
