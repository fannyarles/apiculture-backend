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

  // Construire le filtre de recherche - tous les utilisateurs (y compris les admins)
  let userFilter = {};
  
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
    .select('nom prenom type designation raisonSociale email telephone telephoneMobile dateNaissance adresse role createdAt');

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

// @desc    Modifier un utilisateur
// @route   PUT /api/users-management/:id
// @access  Private/Admin (avec permission editUsers)
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nom, prenom, email, telephone, telephoneMobile, dateNaissance, adresse, napi, siret, typePersonne, designation, raisonSociale } = req.body;

  // Vérifier les permissions
  const isSuperAdmin = req.user.role === 'super_admin';
  const permissions = await Permission.findOne({ userId: req.user._id });
  
  if (!isSuperAdmin && !permissions?.users?.editUsers) {
    res.status(403);
    throw new Error('Permission non autorisée pour modifier les utilisateurs');
  }

  // Trouver l'utilisateur
  const user = await User.findById(id);

  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  // Vérifier que l'utilisateur n'est pas un admin
  if (user.role !== 'user') {
    res.status(403);
    throw new Error('Impossible de modifier un administrateur');
  }

  // Si admin non super_admin, vérifier que l'utilisateur appartient à son organisme
  if (!isSuperAdmin && req.user.organisme) {
    const userAdhesions = await Adhesion.find({ 
      user: id, 
      organisme: req.user.organisme 
    });
    
    if (userAdhesions.length === 0) {
      res.status(403);
      throw new Error('Vous ne pouvez modifier que les utilisateurs de votre organisme');
    }
  }

  // Vérifier si l'email est déjà utilisé par un autre utilisateur
  if (email && email !== user.email) {
    const emailExists = await User.findOne({ email, _id: { $ne: id } });
    if (emailExists) {
      res.status(400);
      throw new Error('Cet email est déjà utilisé par un autre utilisateur');
    }
  }

  // Mettre à jour les champs
  if (nom !== undefined) user.nom = nom;
  if (prenom !== undefined) user.prenom = prenom;
  if (email !== undefined) user.email = email;
  if (telephone !== undefined) user.telephone = telephone;
  if (telephoneMobile !== undefined) user.telephoneMobile = telephoneMobile;
  if (dateNaissance !== undefined) user.dateNaissance = dateNaissance;
  if (napi !== undefined) user.napi = napi;
  if (siret !== undefined) user.siret = siret;
  if (typePersonne !== undefined) user.typePersonne = typePersonne;
  if (designation !== undefined) user.designation = designation;
  if (raisonSociale !== undefined) user.raisonSociale = raisonSociale;
  
  // Mettre à jour l'adresse si fournie
  if (adresse) {
    user.adresse = {
      ...user.adresse,
      ...adresse,
    };
  }

  await user.save();

  res.json({
    _id: user._id,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    telephone: user.telephone,
    telephoneMobile: user.telephoneMobile,
    dateNaissance: user.dateNaissance,
    adresse: user.adresse,
    napi: user.napi,
    siret: user.siret,
    typePersonne: user.typePersonne,
    designation: user.designation,
    raisonSociale: user.raisonSociale,
    message: 'Utilisateur mis à jour avec succès',
  });
});

module.exports = {
  getUsers,
  getUserById,
  updateUser,
};
