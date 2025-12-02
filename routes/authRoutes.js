const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  getUsers,
  deleteUser,
  checkEmail,
} = require('../controllers/authController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes publiques
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/check-email', checkEmail);

// Routes protégées (utilisateur connecté)
router.get('/profile', protect, getUserProfile);
router.get('/me', protect, getUserProfile); // Alias pour compatibilité frontend
router.put('/profile', protect, updateUserProfile);
router.put('/password', protect, changePassword);

// Routes admin
router.get('/users', protect, admin, getUsers);
router.delete('/users/:id', protect, admin, deleteUser);

module.exports = router;
