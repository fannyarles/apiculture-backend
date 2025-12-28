const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Adhesion = require('../models/adhesionModel');
const Permission = require('../models/permissionModel');

// @desc    Récupérer la liste des utilisateurs avec leurs adhésions
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const { search, organisme } = req.query;

  // Vérifier les permissions
  const isSuperAdmin = req.user.role === 'super_admin';
  const permissions = await Permission.findOne({ userId: req.user._id });
  
  if (!isSuperAdmin && !permissions?.users?.access) {
    res.status(403);
    throw new Error('Accès non autorisé');
  }

  // Construire le filtre de recherche - seulement les adhérents (pas les admins)
  let userFilter = { role: 'user' };
  
  if (search) {
    userFilter.$or = [
      { nom: { $regex: search, $options: 'i' } },
      { prenom: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  // Récupérer les utilisateurs
  const users = await User.find(userFilter)
    .select('nom prenom email telephone role createdAt')
    .sort({ createdAt: -1 });

  // Récupérer les adhésions pour ces utilisateurs
  const userIds = users.map(u => u._id);
  
  let adhesionFilter = { user: { $in: userIds } };
  
  // Filtrer par organisme si spécifié (ou si admin non super_admin)
  if (organisme) {
    adhesionFilter.organisme = organisme;
  } else if (!isSuperAdmin && req.user.organisme) {
    adhesionFilter.organisme = req.user.organisme;
  }

  const adhesions = await Adhesion.find(adhesionFilter)
    .select('user organisme annee status paiement createdAt')
    .sort({ annee: -1 });

  // Grouper les adhésions par utilisateur
  const adhesionsByUser = {};
  adhesions.forEach(adhesion => {
    const odId = adhesion.user.toString();
    if (!adhesionsByUser[odId]) {
      adhesionsByUser[odId] = [];
    }
    adhesionsByUser[odId].push({
      _id: adhesion._id,
      organisme: adhesion.organisme,
      annee: adhesion.annee,
      status: adhesion.status,
      paiementStatus: adhesion.paiement?.status,
    });
  });

  // Construire la réponse
  const usersWithAdhesions = users.map(user => ({
    _id: user._id,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    telephone: user.telephone,
    role: user.role,
    createdAt: user.createdAt,
    adhesions: adhesionsByUser[user._id.toString()] || [],
  }));

  // Si admin non super_admin, filtrer les utilisateurs qui ont au moins une adhésion dans son organisme
  let filteredUsers = usersWithAdhesions;
  if (!isSuperAdmin && req.user.organisme) {
    filteredUsers = usersWithAdhesions.filter(u => u.adhesions.length > 0);
  }

  res.json(filteredUsers);
});

// @desc    Récupérer un utilisateur avec ses adhésions
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Vérifier les permissions
  const isSuperAdmin = req.user.role === 'super_admin';
  const permissions = await Permission.findOne({ userId: req.user._id });
  
  if (!isSuperAdmin && !permissions?.users?.access) {
    res.status(403);
    throw new Error('Accès non autorisé');
  }

  const user = await User.findById(id)
    .select('nom prenom email telephone dateNaissance adresse role createdAt');

  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  // Récupérer les adhésions
  let adhesionFilter = { user: id };
  if (!isSuperAdmin && req.user.organisme) {
    adhesionFilter.organisme = req.user.organisme;
  }

  const adhesions = await Adhesion.find(adhesionFilter)
    .select('organisme annee status paiement nombreRuches createdAt')
    .sort({ annee: -1 });

  res.json({
    ...user.toObject(),
    adhesions,
  });
});

module.exports = {
  getUsers,
  getUserById,
};
