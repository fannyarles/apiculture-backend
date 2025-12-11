const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sendEmail = require('../services/emailService');

// @desc    Récupérer tous les administrateurs
// @route   GET /api/admin-management/admins
// @access  Super Admin
const getAdmins = asyncHandler(async (req, res) => {
  const admins = await User.find({ role: 'admin' })
    .select('-password')
    .sort({ nom: 1 });
  
  res.json(admins);
});

// @desc    Créer un compte administrateur
// @route   POST /api/admin-management/admins
// @access  Super Admin
const createAdmin = asyncHandler(async (req, res) => {
  const { prenom, nom, email, organisme } = req.body;

  // Validation
  if (!prenom || !nom || !email || !organisme) {
    res.status(400);
    throw new Error('Tous les champs sont requis');
  }

  // Vérifier si l'email existe déjà
  const userExists = await User.findOne({ email: email.toLowerCase() });

  if (userExists) {
    res.status(400);
    throw new Error('Un utilisateur avec cet email existe déjà');
  }

  // Générer un mot de passe temporaire
  const tempPassword = crypto.randomBytes(8).toString('hex');

  // Hasher le mot de passe
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(tempPassword, salt);

  // Créer l'administrateur
  const admin = await User.create({
    prenom,
    nom,
    email: email.toLowerCase(),
    password: hashedPassword,
    role: 'admin',
    roles: ['admin', 'user'], // Un admin a aussi accès à l'interface user
    organisme,
    isActive: true,
  });

  if (admin) {
    // Envoyer l'email avec les identifiants
    try {
      await sendEmail({
        to: admin.email,
        subject: 'Création de votre compte administrateur',
        html: `
          <h2>Bienvenue ${admin.prenom} ${admin.nom}</h2>
          <p>Votre compte administrateur pour l'organisme <strong>${organisme}</strong> a été créé.</p>
          <p><strong>Vos identifiants de connexion :</strong></p>
          <ul>
            <li>Email : <strong>${admin.email}</strong></li>
            <li>Mot de passe temporaire : <strong>${tempPassword}</strong></li>
          </ul>
          <p>⚠️ Pour des raisons de sécurité, veuillez changer votre mot de passe dès votre première connexion.</p>
          <p><a href="${process.env.FRONTEND_URL}/login">Se connecter</a></p>
        `,
      });
    } catch (emailError) {
      console.error('Erreur envoi email:', emailError);
      // Ne pas bloquer la création si l'email échoue
    }

    res.status(201).json({
      _id: admin._id,
      prenom: admin.prenom,
      nom: admin.nom,
      email: admin.email,
      role: admin.role,
      organisme: admin.organisme,
      tempPassword, // Retourner le mot de passe temporaire pour que le super-admin puisse le communiquer
    });
  } else {
    res.status(400);
    throw new Error('Erreur lors de la création de l\'administrateur');
  }
});

// @desc    Mettre à jour un administrateur
// @route   PUT /api/admin-management/admins/:id
// @access  Super Admin
const updateAdmin = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.params.id);

  if (!admin || admin.role !== 'admin') {
    res.status(404);
    throw new Error('Administrateur non trouvé');
  }

  // Vérifier si le nouvel email existe déjà (si changé)
  if (req.body.email && req.body.email.toLowerCase() !== admin.email) {
    const emailExists = await User.findOne({ 
      email: req.body.email.toLowerCase(),
      _id: { $ne: req.params.id }
    });

    if (emailExists) {
      res.status(400);
      throw new Error('Un utilisateur avec cet email existe déjà');
    }
  }

  // Mettre à jour les champs
  admin.prenom = req.body.prenom || admin.prenom;
  admin.nom = req.body.nom || admin.nom;
  admin.email = req.body.email ? req.body.email.toLowerCase() : admin.email;
  admin.organisme = req.body.organisme || admin.organisme;
  
  if (req.body.isActive !== undefined) {
    admin.isActive = req.body.isActive;
  }

  const updatedAdmin = await admin.save();

  res.json({
    _id: updatedAdmin._id,
    prenom: updatedAdmin.prenom,
    nom: updatedAdmin.nom,
    email: updatedAdmin.email,
    role: updatedAdmin.role,
    organisme: updatedAdmin.organisme,
    isActive: updatedAdmin.isActive,
  });
});

// @desc    Supprimer un administrateur
// @route   DELETE /api/admin-management/admins/:id
// @access  Super Admin
const deleteAdmin = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.params.id);

  if (!admin || admin.role !== 'admin') {
    res.status(404);
    throw new Error('Administrateur non trouvé');
  }

  await admin.deleteOne();
  res.json({ message: 'Administrateur supprimé avec succès' });
});

// @desc    Réinitialiser le mot de passe d'un administrateur
// @route   POST /api/admin-management/admins/:id/reset-password
// @access  Super Admin
const resetAdminPassword = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.params.id);

  if (!admin || admin.role !== 'admin') {
    res.status(404);
    throw new Error('Administrateur non trouvé');
  }

  // Générer un nouveau mot de passe temporaire
  const tempPassword = crypto.randomBytes(8).toString('hex');

  // Hasher le mot de passe
  const salt = await bcrypt.genSalt(10);
  admin.password = await bcrypt.hash(tempPassword, salt);

  await admin.save();

  // Envoyer l'email avec le nouveau mot de passe
  try {
    await sendEmail({
      to: admin.email,
      subject: 'Réinitialisation de votre mot de passe',
      html: `
        <h2>Réinitialisation de mot de passe</h2>
        <p>Bonjour ${admin.prenom} ${admin.nom},</p>
        <p>Votre mot de passe a été réinitialisé par un super-administrateur.</p>
        <p><strong>Votre nouveau mot de passe temporaire :</strong> ${tempPassword}</p>
        <p>⚠️ Veuillez changer ce mot de passe dès votre prochaine connexion.</p>
        <p><a href="${process.env.FRONTEND_URL}/login">Se connecter</a></p>
      `,
    });
  } catch (emailError) {
    console.error('Erreur envoi email:', emailError);
  }

  res.json({
    message: 'Mot de passe réinitialisé avec succès',
    tempPassword, // Retourner le mot de passe temporaire
  });
});

module.exports = {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  resetAdminPassword,
};
