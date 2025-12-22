const asyncHandler = require('express-async-handler');
const Permission = require('../models/permissionModel');
const User = require('../models/userModel');

// @desc    Obtenir les permissions d'un admin
// @route   GET /api/permissions/:userId
// @access  Super Admin
const getAdminPermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.findOne({ userId: req.params.userId });

  if (!permissions) {
    res.status(404);
    throw new Error('Permissions non trouvées');
  }

  res.json(permissions);
});

// @desc    Créer ou mettre à jour les permissions d'un admin
// @route   PUT /api/permissions/:userId
// @access  Super Admin
const updateAdminPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const permissionsData = req.body;

  // Vérifier que l'utilisateur existe et est un admin
  const user = await User.findById(userId);
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    res.status(404);
    throw new Error('Administrateur non trouvé');
  }

  // Chercher les permissions existantes
  let permissions = await Permission.findOne({ userId });

  if (permissions) {
    // Mettre à jour les permissions existantes
    Object.keys(permissionsData).forEach(module => {
      if (permissions[module] && typeof permissionsData[module] === 'object') {
        Object.keys(permissionsData[module]).forEach(permission => {
          if (permissions[module][permission] !== undefined) {
            permissions[module][permission] = permissionsData[module][permission];
          }
        });
      }
    });

    await permissions.save();
  } else {
    // Créer de nouvelles permissions
    permissions = await Permission.create({
      userId,
      ...permissionsData,
    });
  }

  res.json(permissions);
});

// @desc    Obtenir toutes les permissions (pour tous les admins)
// @route   GET /api/permissions
// @access  Super Admin
const getAllPermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.find({}).populate('userId', 'prenom nom email role organismes');
  res.json(permissions);
});

// @desc    Supprimer les permissions d'un admin
// @route   DELETE /api/permissions/:userId
// @access  Super Admin
const deleteAdminPermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.findOne({ userId: req.params.userId });

  if (!permissions) {
    res.status(404);
    throw new Error('Permissions non trouvées');
  }

  await permissions.deleteOne();
  res.json({ message: 'Permissions supprimées avec succès' });
});

// @desc    Obtenir les permissions de l'utilisateur connecté
// @route   GET /api/permissions/me
// @access  Private (Admin)
const getMyPermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.findOne({ userId: req.user._id });

  if (!permissions) {
    // Si pas de permissions, créer des permissions par défaut
    const newPermissions = await Permission.createDefaultPermissions(req.user._id, req.user.role);
    return res.json(newPermissions);
  }

  res.json(permissions);
});

// @desc    Obtenir la structure des modules et permissions (pour l'UI)
// @route   GET /api/permissions/structure
// @access  Super Admin
const getPermissionsStructure = asyncHandler(async (req, res) => {
  const structure = {
    adhesions: {
      label: 'Module Adhésions',
      icon: 'UsersIcon',
      permissions: [
        { key: 'access', label: 'Accès au module adhérents', description: 'Consulter la liste des adhérents' },
        { key: 'sendPaymentLink', label: 'Envoyer des liens de paiement', description: 'Envoyer des liens de paiement par email' },
        { key: 'manageAdhesions', label: 'Gérer les adhésions', description: 'Créer, modifier et supprimer des adhésions' },
        { key: 'changeAdherentStatus', label: 'Changer le statut de l\'adhérent', description: 'Marquer les paiements comme effectués et modifier le statut' },
        { key: 'exportData', label: 'Exporter les données', description: 'Exporter les données des adhérents' },
      ],
    },
    communications: {
      label: 'Module Communications',
      icon: 'EnvelopeIcon',
      permissions: [
        { key: 'access', label: 'Accès au module communications', description: 'Consulter les communications' },
        { key: 'sendEmails', label: 'Envoyer des communications', description: 'Envoyer des emails aux adhérents' },
        { key: 'manageCommunications', label: 'Gérer les communications', description: 'Créer, modifier et supprimer des communications' },
        { key: 'viewStats', label: 'Voir les statistiques', description: 'Consulter les statistiques d\'envoi' },
      ],
    },
    actualites: {
      label: 'Module Actualités',
      icon: 'NewspaperIcon',
      permissions: [
        { key: 'access', label: 'Accès au module actualités', description: 'Consulter les articles' },
        { key: 'createArticles', label: 'Créer des articles', description: 'Rédiger de nouveaux articles' },
        { key: 'editArticles', label: 'Modifier des articles', description: 'Éditer les articles existants' },
        { key: 'deleteArticles', label: 'Supprimer des articles', description: 'Supprimer des articles' },
        { key: 'publishArticles', label: 'Publier des articles', description: 'Publier ou dépublier des articles' },
      ],
    },
    parametres: {
      label: 'Module Paramètres',
      icon: 'Cog6ToothIcon',
      permissions: [
        { key: 'access', label: 'Accès aux paramètres', description: 'Consulter les paramètres' },
        { key: 'manageAdhesionSettings', label: 'Gérer les paramètres d\'adhésion', description: 'Modifier les tarifs et paramètres d\'adhésion' },
        { key: 'manageOrganismes', label: 'Gérer les organismes', description: 'Gérer les organismes (SAR, AMAIR)' },
      ],
    },
    dashboard: {
      label: 'Dashboard',
      icon: 'HomeIcon',
      permissions: [
        { key: 'access', label: 'Accès au dashboard', description: 'Accéder au tableau de bord admin' },
        { key: 'viewStats', label: 'Voir les statistiques', description: 'Consulter les statistiques globales' },
      ],
    },
  };

  res.json(structure);
});

module.exports = {
  getAdminPermissions,
  updateAdminPermissions,
  getAllPermissions,
  deleteAdminPermissions,
  getMyPermissions,
  getPermissionsStructure,
};
