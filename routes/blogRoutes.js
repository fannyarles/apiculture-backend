const express = require('express');
const router = express.Router();
const {
  createArticle,
  getArticles,
  getArticleBySlug,
  updateArticle,
  deleteArticle,
  uploadImage,
  getStats,
} = require('../controllers/blogController');
const { protect, admin } = require('../middleware/authMiddleware');

// Routes publiques (authentifiées)
router.get('/articles', protect, getArticles);
router.get('/articles/:slug', protect, getArticleBySlug);

// Routes admin
router.post('/articles', protect, admin, createArticle);
router.put('/articles/:id', protect, admin, updateArticle);
router.delete('/articles/:id', protect, admin, deleteArticle);
router.post('/upload-image', protect, admin, uploadImage);
router.get('/stats', protect, admin, getStats);

module.exports = router;
