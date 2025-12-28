const express = require('express');
const router = express.Router();
const {
  getComposition,
  getReunionsDisponibles,
  getEligibles,
  ajouterMembre,
  retirerMembre,
  modifierMembre,
  getHistorique,
  miseAJourMasse,
  getDocuments,
  downloadDocument,
  FONCTIONS_BUREAU,
  FRACTIONS,
} = require('../controllers/conseilController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes publiques (composition visible)
router.get('/:organisme', protect, admin, getComposition);

// Routes admin
router.get('/:organisme/reunions', protect, admin, getReunionsDisponibles);
router.get('/:organisme/eligibles', protect, admin, getEligibles);
router.get('/:organisme/historique', protect, admin, getHistorique);
router.get('/:organisme/documents', protect, admin, getDocuments);
router.get('/:organisme/documents/download', protect, admin, downloadDocument);

// Gestion des membres
router.post('/:organisme/membre', protect, admin, ajouterMembre);
router.put('/:organisme/membre/:membreId', protect, admin, modifierMembre);
router.put('/:organisme/membre/:membreId/retrait', protect, admin, retirerMembre);

// Mise à jour en masse
router.put('/:organisme/masse', protect, admin, miseAJourMasse);

// Endpoint pour récupérer les constantes
router.get('/config/options', protect, admin, (req, res) => {
  res.json({
    fonctions: FONCTIONS_BUREAU,
    fractions: FRACTIONS,
  });
});

module.exports = router;
