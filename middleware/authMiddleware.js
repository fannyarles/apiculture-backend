const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');

// Protéger les routes (authentification requise)
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Récupérer le token depuis le header
      token = req.headers.authorization.split(' ')[1];

      // Vérifier le token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Récupérer l'utilisateur depuis le token (sans le mot de passe)
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        res.status(401);
        throw new Error('Utilisateur non trouvé');
      }

      if (!req.user.isActive) {
        res.status(401);
        throw new Error('Compte désactivé');
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Non autorisé, token invalide');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Non autorisé, pas de token');
  }
});

// Vérifier si l'utilisateur est admin
const admin = (req, res, next) => {
  if (req.user && (req.user.hasRole('admin') || req.user.hasRole('super_admin'))) {
    next();
  } else {
    res.status(403);
    throw new Error('Accès refusé - Admin uniquement');
  }
};

// Vérifier si l'utilisateur est super_admin
const superAdmin = (req, res, next) => {
  if (req.user && req.user.hasRole('super_admin')) {
    next();
  } else {
    res.status(403);
    throw new Error('Accès refusé - Super Admin uniquement');
  }
};

module.exports = { protect, admin, superAdmin };
