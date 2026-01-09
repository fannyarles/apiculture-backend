const express = require('express');
const router = express.Router();
const {
  getDestinataireStats,
  createCommunication,
  getCommunications,
  getCommunicationById,
  updateCommunication,
  deleteCommunication,
  sendCommunication
} = require('../controllers/communicationController');
const { protect, admin } = require('../middleware/authMiddleware');

// Toutes les routes nécessitent d'être admin
router.use(protect, admin);

// Route pour obtenir les stats de destinataires
router.get('/destinataires-stats', getDestinataireStats);

router.route('/')
  .get(getCommunications)
  .post(createCommunication);

router.route('/:id')
  .get(getCommunicationById)
  .put(updateCommunication)
  .delete(deleteCommunication);

router.post('/:id/send', sendCommunication);

module.exports = router;
