const express = require('express');
const router = express.Router();
const {
  createService,
  getMyServices,
  getServiceById,
  getAllServices,
  getServicesByAdhesion,
  updateCautionStatus,
  getMiellerieStatusByAdhesion,
  getServicesStatusByAdhesion,
  getAMAIRAddress,
  canSubscribeMiellerie,
  canSubscribeUNAF,
  modifyUNAFSubscription,
  confirmUNAFModification,
} = require('../controllers/serviceController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes publiques
router.get('/amair-address', getAMAIRAddress);

// Routes utilisateur
router.post('/', protect, createService);
router.get('/my-services', protect, getMyServices);
router.get('/can-subscribe/miellerie', protect, canSubscribeMiellerie);
router.get('/can-subscribe/assurance-unaf', protect, canSubscribeUNAF);
router.get('/adhesion/:adhesionId', protect, getServicesByAdhesion);
router.put('/:serviceId/modify-unaf', protect, modifyUNAFSubscription);
router.post('/:serviceId/confirm-modification', protect, confirmUNAFModification);

// Routes admin
router.get('/', protect, admin, getAllServices);
router.get('/admin/miellerie-status', protect, admin, getMiellerieStatusByAdhesion);
router.get('/admin/services-status', protect, admin, getServicesStatusByAdhesion);
router.put('/:id/caution', protect, admin, updateCautionStatus);

// Routes avec paramètres - DOIVENT être après les routes spécifiques
router.get('/:id', protect, getServiceById);

module.exports = router;
