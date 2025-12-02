const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');

// Générer un token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Inscription d'un nouvel utilisateur
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { prenom, nom, email, password, telephone, adresse, dateNaissance } = req.body;

  // Vérifier si les champs obligatoires sont remplis
  if (!prenom || !nom || !email || !password) {
    res.status(400);
    throw new Error('Veuillez remplir tous les champs obligatoires (prénom, nom, email, mot de passe)');
  }

  // Vérifier si l'utilisateur existe déjà
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('Cet email est déjà utilisé');
  }

  // Créer l'utilisateur avec les champs fournis
  const userData = {
    prenom,
    nom,
    email,
    password,
  };

  // Ajouter les champs optionnels s'ils sont fournis
  if (telephone) userData.telephone = telephone;
  if (adresse) userData.adresse = adresse;
  if (dateNaissance) userData.dateNaissance = dateNaissance;

  const user = await User.create(userData);

  if (user) {
    res.status(201).json({
      _id: user._id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      telephone: user.telephone,
      adresse: user.adresse,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error("Impossible de créer l'utilisateur");
  }
});

// @desc    Connexion d'un utilisateur
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Vérifier l'utilisateur
  const user = await User.findOne({ email });

  if (!user) {
    res.status(401);
    throw new Error('Email ou mot de passe incorrect');
  }

  if (!user.isActive) {
    res.status(401);
    throw new Error('Votre compte a été désactivé');
  }

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      telephone: user.telephone,
      adresse: user.adresse,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    res.status(401);
    throw new Error('Email ou mot de passe incorrect');
  }
});

// @desc    Obtenir le profil de l'utilisateur connecté
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');

  if (user) {
    // Retourner le format attendu par le frontend avec mapping des champs
    res.json({
      _id: user._id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      telephone: user.telephone,
      adresse: user.adresse,
      dateNaissance: user.dateNaissance,
      role: user.role,
      isActive: user.isActive,
      // Ajouter personalInfo avec mapping pour compatibilité frontend
      personalInfo: {
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        adresse: user.adresse ? {
          rue: user.adresse.rue,
          codePostal: user.adresse.codePostal,
          ville: user.adresse.ville
        } : null,
        dateNaissance: user.dateNaissance,
      }
    });
  } else {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }
});

// @desc    Mettre à jour le profil de l'utilisateur
// @route   PUT /api/auth/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    console.log(req.body);
    
    // Mettre à jour les champs simples
    if (req.body.prenom !== undefined) user.prenom = req.body.prenom;
    if (req.body.nom !== undefined) user.nom = req.body.nom;
    if (req.body.email !== undefined) user.email = req.body.email;
    if (req.body.telephone !== undefined) user.telephone = req.body.telephone;
    if (req.body.dateNaissance !== undefined) user.dateNaissance = req.body.dateNaissance;
    
    // Mettre à jour l'adresse (objet complet)
    if (req.body.adresse !== undefined) {
      user.adresse = req.body.adresse;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      prenom: updatedUser.prenom,
      nom: updatedUser.nom,
      email: updatedUser.email,
      telephone: updatedUser.telephone,
      adresse: updatedUser.adresse,
      dateNaissance: updatedUser.dateNaissance,
      role: updatedUser.role,
      token: generateToken(updatedUser._id),
    });
  } else {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }
});

// @desc    Changer le mot de passe
// @route   PUT /api/auth/password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error('Veuillez fournir le mot de passe actuel et le nouveau');
  }

  const user = await User.findById(req.user._id);

  if (user && (await user.matchPassword(currentPassword))) {
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Mot de passe modifié avec succès' });
  } else {
    res.status(401);
    throw new Error('Mot de passe actuel incorrect');
  }
});

// @desc    Obtenir tous les utilisateurs (Admin)
// @route   GET /api/auth/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).select('-password');
  res.json(users);
});

// @desc    Supprimer un utilisateur (Admin)
// @route   DELETE /api/auth/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    await user.deleteOne();
    res.json({ message: 'Utilisateur supprimé' });
  } else {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }
});

// @desc    Vérifier si un email existe
// @route   POST /api/auth/check-email
// @access  Public
const checkEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  const userExists = await User.findOne({ email });
  
  res.json({ exists: !!userExists });
});

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  getUsers,
  deleteUser,
  checkEmail,
};
