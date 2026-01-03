const express = require('express');
const router = express.Router();
const {
  previewUsersFromAdhesions,
  createUsersFromAdhesions,
  resendActivationEmail,
  getPendingActivations,
  sendReminders,
  cleanupExpiredAccounts,
} = require('../controllers/userMigrationController');
const { protect, superAdmin } = require('../middleware/authMiddleware');

// Toutes les routes nécessitent d'être super_admin
router.use(protect);
router.use(superAdmin);

// Prévisualiser les utilisateurs à créer
router.get('/preview', previewUsersFromAdhesions);

// Créer les utilisateurs à partir des adhésions
router.post('/create', createUsersFromAdhesions);

// Renvoyer l'email d'activation
router.post('/resend-email/:userId', resendActivationEmail);

// Liste des utilisateurs en attente d'activation
router.get('/pending', getPendingActivations);

// Envoyer les rappels
router.post('/send-reminders', sendReminders);

// Nettoyer les comptes expirés
router.delete('/cleanup-expired', cleanupExpiredAccounts);

module.exports = router;
