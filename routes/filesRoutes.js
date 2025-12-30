const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const path = require('path');
const { protect, admin } = require('../middleware/authMiddleware');
const File = require('../models/fileModel');
const s3Service = require('../services/s3Service');

// Configuration de multer pour stocker en mémoire (buffer)
const storage = multer.memoryStorage();

// Filtrer les types de fichiers acceptés
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Formats acceptés: JPEG, PNG, PDF, DOC, DOCX'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB
  fileFilter: fileFilter
});

// @desc    Upload un fichier
// @route   POST /api/files/upload
// @access  Private
router.post('/upload', protect, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Aucun fichier fourni');
  }

  const { type, organisme, adhesionId } = req.body;

  if (!type) {
    res.status(400);
    throw new Error('Le type de fichier est requis');
  }

  try {
    // Construire le nom de fichier personnalisé selon le type
    let fileName = req.file.originalname;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const currentYear = new Date().getFullYear();
    
    // Récupérer les infos utilisateur pour le renommage
    const userNom = (req.user.nom || '').replace(/[^a-zA-Z0-9]/g, '');
    const userPrenom = (req.user.prenom || '').replace(/[^a-zA-Z0-9]/g, '');
    
    // Renommer selon le type de document
    if (type === 'declaration_ruches') {
      fileName = `declarationRuches${currentYear}_${userNom}${userPrenom}${fileExtension}`;
    }
    
    // Upload vers S3
    const s3Result = await s3Service.uploadFile(
      req.file.buffer,
      fileName,
      req.file.mimetype,
      `adhesions/${adhesionId || 'temp'}`
    );

    // Créer l'entrée dans MongoDB
    const file = await File.create({
      nom: fileName.replace(/\.[^/.]+$/, ''), // Nom sans extension
      nomOriginal: fileName,
      s3Key: s3Result.key,
      s3Bucket: s3Result.bucket,
      mimeType: req.file.mimetype,
      taille: req.file.size,
      type: type,
      organisme: organisme || 'commun',
      adhesion: adhesionId || null,
      uploadedBy: req.user._id,
      statut: 'actif'
    });

    res.status(201).json({
      _id: file._id,
      nom: file.nom,
      nomOriginal: file.nomOriginal,
      type: file.type,
      organisme: file.organisme,
      taille: file.taille,
      mimeType: file.mimeType,
      message: 'Fichier uploadé avec succès'
    });
  } catch (error) {
    console.error('Erreur upload fichier:', error);
    res.status(500);
    throw new Error('Erreur lors de l\'upload du fichier');
  }
}));

// @desc    Télécharger un fichier (génère une URL signée)
// @route   GET /api/files/:fileId
// @access  Private
router.get('/:fileId', protect, asyncHandler(async (req, res) => {
  const fileId = req.params.fileId;
  
  // Récupérer les métadonnées depuis MongoDB
  const file = await File.findById(fileId);

  if (!file || file.statut === 'supprime') {
    res.status(404);
    throw new Error('Fichier non trouvé');
  }

  // Vérifier les permissions
  // L'utilisateur doit être le propriétaire, admin, ou propriétaire de l'adhésion
  const isOwner = file.uploadedBy.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  
  if (!isOwner && !isAdmin) {
    // Vérifier si l'utilisateur est propriétaire de l'adhésion
    if (file.adhesion) {
      const Adhesion = require('../models/adhesionModel');
      const adhesion = await Adhesion.findById(file.adhesion);
      if (!adhesion || adhesion.user.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Non autorisé à accéder à ce fichier');
      }
    } else {
      res.status(403);
      throw new Error('Non autorisé à accéder à ce fichier');
    }
  }

  try {
    // Générer une URL signée valide 1 heure
    const signedUrl = await s3Service.getSignedUrl(file.s3Key, 3600);

    res.json({
      url: signedUrl,
      nom: file.nomOriginal,
      type: file.mimeType,
      taille: file.taille,
      expiresIn: 3600 // secondes
    });
  } catch (error) {
    console.error('Erreur génération URL:', error);
    res.status(500);
    throw new Error('Erreur lors de la génération du lien de téléchargement');
  }
}));

// @desc    Supprimer un fichier
// @route   DELETE /api/files/:fileId
// @access  Private
router.delete('/:fileId', protect, asyncHandler(async (req, res) => {
  const fileId = req.params.fileId;
  
  const file = await File.findById(fileId);

  if (!file || file.statut === 'supprime') {
    res.status(404);
    throw new Error('Fichier non trouvé');
  }

  // Vérifier que l'utilisateur est le propriétaire ou admin
  const isOwner = file.uploadedBy.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  
  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('Non autorisé à supprimer ce fichier');
  }

  try {
    // Supprimer de S3
    await s3Service.deleteFile(file.s3Key);

    // Marquer comme supprimé dans MongoDB (soft delete)
    file.statut = 'supprime';
    await file.save();

    res.json({ message: 'Fichier supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression fichier:', error);
    res.status(500);
    throw new Error('Erreur lors de la suppression du fichier');
  }
}));

// @desc    Lister les fichiers d'une adhésion
// @route   GET /api/files/adhesion/:adhesionId
// @access  Private
router.get('/adhesion/:adhesionId', protect, asyncHandler(async (req, res) => {
  const { adhesionId } = req.params;

  // Vérifier les permissions
  const Adhesion = require('../models/adhesionModel');
  const adhesion = await Adhesion.findById(adhesionId);

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  const isOwner = adhesion.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Récupérer tous les fichiers de l'adhésion
  const files = await File.find({
    adhesion: adhesionId,
    statut: 'actif'
  }).select('-s3Key -s3Bucket').populate('uploadedBy', 'prenom nom email');

  res.json(files);
}));

// @desc    Télécharger un fichier par sa clé S3 (téléchargement direct)
// @route   GET /api/files/download/:s3Key
// @access  Private
router.get('/download/:s3Key(*)', protect, asyncHandler(async (req, res) => {
  const s3Key = req.params.s3Key;
  
  // Récupérer les métadonnées depuis MongoDB par la clé S3
  const file = await File.findOne({ s3Key: s3Key, statut: 'actif' });

  if (!file) {
    res.status(404);
    throw new Error('Fichier non trouvé');
  }

  // Vérifier les permissions
  const isOwner = file.uploadedBy.toString() === req.user._id.toString();
  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
  
  if (!isOwner && !isAdmin) {
    // Vérifier si l'utilisateur est propriétaire de l'adhésion liée
    if (file.adhesion) {
      const Adhesion = require('../models/adhesionModel');
      const adhesion = await Adhesion.findById(file.adhesion);
      if (adhesion && adhesion.user.toString() === req.user._id.toString()) {
        // OK, l'utilisateur est propriétaire de l'adhésion
      } else {
        res.status(403);
        throw new Error('Non autorisé à accéder à ce fichier');
      }
    } else if (file.service) {
      // Vérifier si l'utilisateur est propriétaire du service lié
      const Service = require('../models/serviceModel');
      const service = await Service.findById(file.service);
      if (service && service.user.toString() === req.user._id.toString()) {
        // OK, l'utilisateur est propriétaire du service
      } else {
        res.status(403);
        throw new Error('Non autorisé à accéder à ce fichier');
      }
    } else {
      res.status(403);
      throw new Error('Non autorisé à accéder à ce fichier');
    }
  }

  try {
    // Télécharger le fichier depuis S3
    const fileBuffer = await s3Service.downloadFile(s3Key);

    // Définir les headers pour le téléchargement
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.nomOriginal}"`);
    res.setHeader('Content-Length', file.taille);

    // Envoyer le fichier
    res.send(fileBuffer);
  } catch (error) {
    console.error('Erreur téléchargement fichier:', error);
    res.status(500);
    throw new Error('Erreur lors du téléchargement du fichier');
  }
}));

module.exports = router;
