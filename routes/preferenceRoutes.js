const express = require('express');
const router = express.Router();
const {
  getPreferences,
  updatePreferences,
} = require('../controllers/preferenceController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getPreferences)
  .put(protect, updatePreferences);

module.exports = router;
