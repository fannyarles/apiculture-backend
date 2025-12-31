const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, admin } = require('../middleware/authMiddleware');
const {
  createReunion,
  getReunions,
  getReunionById,
  updateReunion,
  deleteReunion,
  addDocument,
  deleteDocument,
  getDocument,
  generateEmargement,
  deleteEmargement,
  getMembresConvocation,
  preparerConvocation,
  envoyerConvocationReunion,
  updatePresence,
  updateAllPresences,
  getConvocationPdf,
} = require('../controllers/reunionController');

// Configuration de multer pour stocker en mémoire (buffer)
const storage = multer.memoryStorage();

// Filtrer les types de fichiers acceptés
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx|ppt|pptx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.includes('image') || 
                   file.mimetype.includes('pdf') || 
                   file.mimetype.includes('document') ||
                   file.mimetype.includes('spreadsheet') ||
                   file.mimetype.includes('presentation') ||
                   file.mimetype.includes('msword') ||
                   file.mimetype.includes('officedocument');

  if (mimetype || extname) {
    return cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Formats acceptés: Images, PDF, Word, Excel, PowerPoint'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB
  fileFilter: fileFilter,
});

// Middleware pour vérifier la permission "reunions"
const checkReunionPermission = async (req, res, next) => {
  try {
    const Permission = require('../models/permissionModel');
    
    // Super admin a tous les accès
    if (req.user.role === 'super_admin') {
      return next();
    }

    const permissions = await Permission.findOne({ userId: req.user._id });
    
    if (!permissions || !permissions.reunions?.access) {
      return res.status(403).json({ 
        message: 'Accès non autorisé au module réunions' 
      });
    }

    next();
  } catch (error) {
    console.error('Erreur vérification permission réunion:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Routes CRUD
router.route('/')
  .get(protect, admin, checkReunionPermission, getReunions)
  .post(protect, admin, checkReunionPermission, createReunion);

router.route('/:id')
  .get(protect, admin, checkReunionPermission, getReunionById)
  .put(protect, admin, checkReunionPermission, updateReunion)
  .delete(protect, admin, checkReunionPermission, deleteReunion);

// Routes pour les documents
router.route('/:id/documents')
  .post(protect, admin, checkReunionPermission, upload.single('document'), addDocument);

router.route('/:id/documents/:documentId')
  .get(protect, admin, checkReunionPermission, getDocument)
  .delete(protect, admin, checkReunionPermission, deleteDocument);

// Routes pour la feuille d'émargement
router.route('/:id/emargement')
  .post(protect, admin, checkReunionPermission, generateEmargement)
  .delete(protect, admin, checkReunionPermission, deleteEmargement);

// Routes pour les convocations
router.route('/:id/membres-convocation')
  .get(protect, admin, checkReunionPermission, getMembresConvocation);

router.route('/:id/preparer-convocation')
  .post(protect, admin, checkReunionPermission, preparerConvocation);

router.route('/:id/convoquer')
  .post(protect, admin, checkReunionPermission, envoyerConvocationReunion);

router.route('/:id/convocation-pdf')
  .get(protect, admin, checkReunionPermission, getConvocationPdf);

// Routes pour les présences
router.route('/:id/presences')
  .put(protect, admin, checkReunionPermission, updateAllPresences);

router.route('/:id/presences/:membreId')
  .put(protect, admin, checkReunionPermission, updatePresence);

module.exports = router;
