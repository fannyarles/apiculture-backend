const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/userModel');
const Permission = require('../models/permissionModel');

// Configuration du transporteur SMTP pour les emails
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

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
      roles: user.roles,
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
    // Charger les permissions depuis le modèle Permission
    let permissions = null;
    if (user.role === 'admin' || user.role === 'super_admin') {
      permissions = await Permission.findOne({ userId: user._id });
      if (!permissions) {
        // Créer des permissions par défaut si elles n'existent pas
        permissions = await Permission.createDefaultPermissions(user._id, user.role);
      }
    }

    res.json({
      _id: user._id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      telephone: user.telephone,
      adresse: user.adresse,
      role: user.role,
      roles: user.roles,
      organisme: user.organisme,
      organismes: user.organismes,
      permissions: permissions,
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
    // Charger les permissions depuis le modèle Permission
    let permissions = null;
    if (user.role === 'admin' || user.role === 'super_admin') {
      permissions = await Permission.findOne({ userId: user._id });
      if (!permissions) {
        // Créer des permissions par défaut si elles n'existent pas
        permissions = await Permission.createDefaultPermissions(user._id, user.role);
      }
    }

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
      roles: user.roles,
      organisme: user.organisme,
      organismes: user.organismes,
      permissions: permissions,
      isActive: user.isActive,
      // Ajouter personalInfo avec mapping pour compatibilité frontend
      personalInfo: {
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        telephoneMobile: user.telephoneMobile,
        adresse: user.adresse ? {
          rue: user.adresse.rue,
          complement: user.adresse.complement,
          codePostal: user.adresse.codePostal,
          ville: user.adresse.ville,
          pays: user.adresse.pays || 'France'
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
    
    // Mettre à jour les champs simples
    if (req.body.prenom !== undefined) user.prenom = req.body.prenom;
    if (req.body.nom !== undefined) user.nom = req.body.nom;
    if (req.body.email !== undefined) user.email = req.body.email;
    if (req.body.telephone !== undefined) user.telephone = req.body.telephone;
    if (req.body.telephoneMobile !== undefined) user.telephoneMobile = req.body.telephoneMobile;
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
      telephoneMobile: updatedUser.telephoneMobile,
      adresse: updatedUser.adresse,
      dateNaissance: updatedUser.dateNaissance,
      role: updatedUser.role,
      roles: updatedUser.roles,
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

// @desc    Demander la réinitialisation du mot de passe
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error('Veuillez fournir une adresse email');
  }

  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error('Aucun utilisateur trouvé avec cet email');
  }

  // Générer un token de réinitialisation
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Hasher le token et le sauvegarder
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // Définir l'expiration à 1 heure
  user.resetPasswordExpire = Date.now() + 3600000;
  
  try {
    await user.save({ validateBeforeSave: false });
  } catch (saveError) {
    console.error('Erreur lors de la sauvegarde du token:', saveError);
    res.status(500);
    throw new Error('Erreur lors de la sauvegarde du token de réinitialisation');
  }

  // Créer l'URL de réinitialisation
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  // Message de l'email
  const message = `
    <h1>Réinitialisation de mot de passe</h1>
    <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
    <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
    <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;">Réinitialiser mon mot de passe</a>
    <p>Ce lien est valable pendant 1 heure.</p>
    <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.PLATFORM_NAME}" ${process.env.SMTP_FROM_EMAIL}`,
      to: user.email,
      subject: 'Réinitialisation de mot de passe',
      html: message,
    });

    res.json({ 
      success: true,
      message: 'Email de réinitialisation envoyé' 
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(500);
    throw new Error('Erreur lors de l\'envoi de l\'email');
  }
});

// @desc    Réinitialiser le mot de passe
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    res.status(400);
    throw new Error('Veuillez fournir un nouveau mot de passe');
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error('Le mot de passe doit contenir au moins 6 caractères');
  }

  // Hasher le token reçu pour le comparer
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  // Trouver l'utilisateur avec le token valide
  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error('Token invalide ou expiré');
  }

  // Mettre à jour le mot de passe
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.json({ 
    success: true,
    message: 'Mot de passe réinitialisé avec succès' 
  });
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
  forgotPassword,
  resetPassword,
};
