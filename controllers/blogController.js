const asyncHandler = require('express-async-handler');
const Article = require('../models/articleModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configuration multer pour upload d'images
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/actualites');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'actualites-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images sont autorisées (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// @desc    Créer un nouvel article
// @route   POST /api/actualites/articles
// @access  Private/Admin
const createArticle = asyncHandler(async (req, res) => {
  const { titre, contenu, extrait, visibilite, statut, datePublication, imagePrincipale, tags } =
    req.body;

  if (!titre || !contenu) {
    res.status(400);
    throw new Error('Le titre et le contenu sont requis');
  }

  if (!visibilite) {
    res.status(400);
    throw new Error('La visibilité est requise');
  }

  // Générer le slug
  const slug = await Article.generateSlug(titre);

  // Vérifier la date de publication pour les articles programmés
  let finalStatut = statut || 'brouillon';
  let finalDatePublication = null;

  if (finalStatut === 'programme') {
    if (!datePublication) {
      res.status(400);
      throw new Error('La date de publication est requise pour un article programmé');
    }
    finalDatePublication = new Date(datePublication);
    if (finalDatePublication <= new Date()) {
      res.status(400);
      throw new Error('La date de publication doit être dans le futur');
    }
  } else if (finalStatut === 'publie') {
    finalDatePublication = new Date();
  }

  const article = await Article.create({
    titre,
    slug,
    contenu,
    extrait,
    auteur: req.user._id,
    organisme: req.user.organisme,
    visibilite,
    statut: finalStatut,
    datePublication: finalDatePublication,
    imagePrincipale,
    tags: tags || [],
  });

  const populatedArticle = await Article.findById(article._id).populate(
    'auteur',
    'prenom nom email'
  );

  res.status(201).json(populatedArticle);
});

// @desc    Obtenir tous les articles (avec filtres)
// @route   GET /api/actualites/articles
// @access  Private
const getArticles = asyncHandler(async (req, res) => {
  const { statut, organisme, visibilite, tag, page = 1, limit = 10 } = req.query;

  let filter = {};

  // Filtrer par tag si spécifié
  if (tag) {
    filter.tags = tag;
  }

  // Si admin, peut voir tous les articles
  if (req.user.role === 'admin') {
    if (statut) {
      // Filtre par statut spécifique
      filter.statut = statut;
    }
    // Sinon, pas de filtre de statut (voir tous les articles)
  } else {
    // Utilisateur normal : seulement articles publiés
    filter.statut = 'publie';
    filter.$or = [
      { visibilite: 'tous' },
      { visibilite: 'organisme', organisme: req.user.organisme },
    ];
  }

  // Filtres additionnels
  if (organisme && req.user.role === 'admin') {
    filter.organisme = organisme;
  }

  if (visibilite && req.user.role === 'admin') {
    filter.visibilite = visibilite;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const articles = await Article.find(filter)
    .populate('auteur', 'prenom nom email')
    .sort({ datePublication: -1, createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Article.countDocuments(filter);

  res.json({
    articles,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    total,
  });
});

// @desc    Obtenir un article par slug
// @route   GET /api/actualites/articles/:slug
// @access  Private
const getArticleBySlug = asyncHandler(async (req, res) => {
  const article = await Article.findOne({ slug: req.params.slug }).populate(
    'auteur',
    'prenom nom email'
  );

  if (!article) {
    res.status(404);
    throw new Error('Article non trouvé');
  }

  // Vérifier la visibilité
  if (!article.isVisibleFor(req.user)) {
    res.status(403);
    throw new Error('Vous n\'avez pas accès à cet article');
  }

  // Incrémenter les vues (sauf pour l'auteur et les admins)
  if (!['admin', 'super_admin'].includes(req.user.role) && article.auteur._id.toString() !== req.user._id.toString()) {
    article.vues += 1;
    await article.save();
  }

  res.json(article);
});

// @desc    Mettre à jour un article
// @route   PUT /api/actualites/articles/:id
// @access  Private/Admin
const updateArticle = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id);

  if (!article) {
    res.status(404);
    throw new Error('Article non trouvé');
  }

  // Vérifier que l'admin appartient au même organisme
  if (article.organisme !== req.user.organisme) {
    res.status(403);
    throw new Error('Non autorisé à modifier cet article');
  }

  const { titre, contenu, extrait, visibilite, statut, datePublication, imagePrincipale, tags } =
    req.body;

  // Mettre à jour le slug si le titre a changé
  if (titre && titre !== article.titre) {
    article.slug = await Article.generateSlug(titre, article._id);
  }

  article.titre = titre || article.titre;
  article.contenu = contenu || article.contenu;
  article.extrait = extrait !== undefined ? extrait : article.extrait;
  article.visibilite = visibilite || article.visibilite;
  article.imagePrincipale = imagePrincipale !== undefined ? imagePrincipale : article.imagePrincipale;
  article.tags = tags !== undefined ? tags : article.tags;

  // Gestion du statut et de la date de publication
  if (statut) {
    article.statut = statut;

    if (statut === 'programme') {
      if (!datePublication) {
        res.status(400);
        throw new Error('La date de publication est requise pour un article programmé');
      }
      article.datePublication = new Date(datePublication);
      if (article.datePublication <= new Date()) {
        res.status(400);
        throw new Error('La date de publication doit être dans le futur');
      }
    } else if (statut === 'publie' && !article.datePublication) {
      article.datePublication = new Date();
    }
  }

  const updatedArticle = await article.save();
  const populatedArticle = await Article.findById(updatedArticle._id).populate(
    'auteur',
    'prenom nom email'
  );

  res.json(populatedArticle);
});

// @desc    Supprimer un article
// @route   DELETE /api/actualites/articles/:id
// @access  Private/Admin
const deleteArticle = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id);

  if (!article) {
    res.status(404);
    throw new Error('Article non trouvé');
  }

  // Vérifier que l'admin appartient au même organisme
  if (article.organisme !== req.user.organisme) {
    res.status(403);
    throw new Error('Non autorisé à supprimer cet article');
  }

  await article.deleteOne();

  res.json({ message: 'Article supprimé' });
});

// @desc    Upload une image pour un article
// @route   POST /api/actualites/upload-image
// @access  Private/Admin
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Aucune image fournie');
  }

  const imageUrl = `/uploads/actualites/${req.file.filename}`;

  res.json({
    location: imageUrl,
    url: imageUrl,
  });
});

// @desc    Obtenir les statistiques des articles (Admin)
// @route   GET /api/actualites/stats
// @access  Private/Admin
const getStats = asyncHandler(async (req, res) => {
  const organisme = req.user.organisme;

  const total = await Article.countDocuments({ organisme });
  const publies = await Article.countDocuments({ organisme, statut: 'publie' });
  const brouillons = await Article.countDocuments({ organisme, statut: 'brouillon' });
  const programmes = await Article.countDocuments({ organisme, statut: 'programme' });

  const vuesTotal = await Article.aggregate([
    { $match: { organisme } },
    { $group: { _id: null, total: { $sum: '$vues' } } },
  ]);

  res.json({
    total,
    publies,
    brouillons,
    programmes,
    vuesTotal: vuesTotal[0]?.total || 0,
  });
});

module.exports = {
  createArticle,
  getArticles,
  getArticleBySlug,
  updateArticle,
  deleteArticle,
  uploadImage: [upload.single('file'), uploadImage],
  getStats,
};
