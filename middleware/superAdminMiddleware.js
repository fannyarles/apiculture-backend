const asyncHandler = require('express-async-handler');

// Middleware pour vérifier que l'utilisateur est super-admin
const superAdmin = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.hasRole('super_admin')) {
    next();
  } else {
    res.status(403);
    throw new Error('Accès refusé. Droits super-administrateur requis.');
  }
});

module.exports = { superAdmin };
