const asyncHandler = require('express-async-handler');
const Reunion = require('../models/reunionModel');
const s3Service = require('../services/s3Service');

// @desc    Créer une réunion
// @route   POST /api/reunions
// @access  Private/Admin
const createReunion = asyncHandler(async (req, res) => {
  const { date, type, lieu, notes, organisme } = req.body;

  if (!date || !type || !lieu || !organisme) {
    res.status(400);
    throw new Error('La date, le type, le lieu et l\'organisme sont requis');
  }

  // Vérifier que l'admin a accès à cet organisme
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(organisme)) {
    res.status(403);
    throw new Error('Vous n\'avez pas accès à cet organisme');
  }

  const reunion = await Reunion.create({
    date,
    type,
    lieu,
    notes: notes || '',
    organisme,
    creePar: req.user._id,
    documents: [],
  });

  const populatedReunion = await Reunion.findById(reunion._id)
    .populate('creePar', 'prenom nom email');

  res.status(201).json(populatedReunion);
});

// @desc    Obtenir toutes les réunions
// @route   GET /api/reunions
// @access  Private/Admin
const getReunions = asyncHandler(async (req, res) => {
  const { annee, type, organisme } = req.query;

  let filter = {};
  
  // Super admin voit tout, admin voit ses organismes
  if (req.user.role === 'super_admin') {
    if (organisme) {
      filter.organisme = organisme;
    }
  } else {
    const userOrganismes = req.user.organismes || [req.user.organisme];
    // Si l'admin filtre par un organisme spécifique, vérifier qu'il y a accès
    if (organisme && userOrganismes.includes(organisme)) {
      filter.organisme = organisme;
    } else {
      filter.organisme = { $in: userOrganismes };
    }
  }

  // Filtrage par année
  if (annee) {
    const startDate = new Date(annee, 0, 1);
    const endDate = new Date(annee, 11, 31, 23, 59, 59);
    filter.date = { $gte: startDate, $lte: endDate };
  }

  // Filtrage par type
  if (type) {
    filter.type = type;
  }

  const reunions = await Reunion.find(filter)
    .populate('creePar', 'prenom nom email')
    .populate('modifiePar', 'prenom nom email')
    .sort({ date: -1 });

  res.json(reunions);
});

// @desc    Obtenir une réunion par ID
// @route   GET /api/reunions/:id
// @access  Private/Admin
const getReunionById = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id)
    .populate('creePar', 'prenom nom email')
    .populate('modifiePar', 'prenom nom email');

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier que l'admin appartient au même organisme
  if (reunion.organisme !== req.user.organisme && req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Non autorisé à accéder à cette réunion');
  }

  // Générer des URLs signées pour les documents
  if (reunion.documents && reunion.documents.length > 0) {
    for (let doc of reunion.documents) {
      try {
        doc.url = await s3Service.getSignedUrl(doc.key, 3600);
      } catch (error) {
        console.error('Erreur génération URL signée:', error);
        doc.url = null;
      }
    }
  }

  res.json(reunion);
});

// @desc    Mettre à jour une réunion
// @route   PUT /api/reunions/:id
// @access  Private/Admin
const updateReunion = asyncHandler(async (req, res) => {
  const { date, type, lieu, notes } = req.body;

  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier que l'admin appartient au même organisme
  if (reunion.organisme !== req.user.organisme && req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Non autorisé à modifier cette réunion');
  }

  reunion.date = date || reunion.date;
  reunion.type = type || reunion.type;
  reunion.lieu = lieu || reunion.lieu;
  reunion.notes = notes !== undefined ? notes : reunion.notes;
  reunion.modifiePar = req.user._id;

  const updatedReunion = await reunion.save();

  const populatedReunion = await Reunion.findById(updatedReunion._id)
    .populate('creePar', 'prenom nom email')
    .populate('modifiePar', 'prenom nom email');

  res.json(populatedReunion);
});

// @desc    Supprimer une réunion
// @route   DELETE /api/reunions/:id
// @access  Private/Admin
const deleteReunion = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier que l'admin appartient au même organisme
  if (reunion.organisme !== req.user.organisme && req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Non autorisé à supprimer cette réunion');
  }

  // Supprimer les documents associés de S3
  if (reunion.documents && reunion.documents.length > 0) {
    for (const doc of reunion.documents) {
      try {
        await s3Service.deleteFile(doc.key);
      } catch (error) {
        console.error('Erreur suppression document S3:', error);
      }
    }
  }

  await Reunion.findByIdAndDelete(req.params.id);

  res.json({ message: 'Réunion supprimée avec succès' });
});

// @desc    Ajouter un document à une réunion
// @route   POST /api/reunions/:id/documents
// @access  Private/Admin
const addDocument = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier que l'admin appartient au même organisme
  if (reunion.organisme !== req.user.organisme && req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Non autorisé à ajouter un document à cette réunion');
  }

  if (!req.file) {
    res.status(400);
    throw new Error('Aucun fichier fourni');
  }

  try {
    // Upload vers S3
    const s3Result = await s3Service.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      `reunions/${reunion.organisme}/${reunion._id}`
    );

    // Ajouter le document à la réunion
    const newDocument = {
      nom: req.file.originalname.replace(/\.[^/.]+$/, ''),
      nomOriginal: req.file.originalname,
      key: s3Result.key,
      type: req.file.mimetype,
      taille: req.file.size,
      dateAjout: new Date(),
    };

    reunion.documents.push(newDocument);
    reunion.modifiePar = req.user._id;
    await reunion.save();

    // Générer l'URL signée pour le nouveau document
    newDocument.url = await s3Service.getSignedUrl(s3Result.key, 3600);

    res.status(201).json({
      message: 'Document ajouté avec succès',
      document: newDocument,
    });
  } catch (error) {
    console.error('Erreur upload document:', error);
    res.status(500);
    throw new Error('Erreur lors de l\'upload du document');
  }
});

// @desc    Supprimer un document d'une réunion
// @route   DELETE /api/reunions/:id/documents/:documentId
// @access  Private/Admin
const deleteDocument = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier que l'admin appartient au même organisme
  if (reunion.organisme !== req.user.organisme && req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Non autorisé à supprimer un document de cette réunion');
  }

  const documentIndex = reunion.documents.findIndex(
    (doc) => doc._id.toString() === req.params.documentId
  );

  if (documentIndex === -1) {
    res.status(404);
    throw new Error('Document non trouvé');
  }

  const document = reunion.documents[documentIndex];

  // Supprimer de S3
  try {
    await s3Service.deleteFile(document.key);
  } catch (error) {
    console.error('Erreur suppression S3:', error);
  }

  // Supprimer du tableau
  reunion.documents.splice(documentIndex, 1);
  reunion.modifiePar = req.user._id;
  await reunion.save();

  res.json({ message: 'Document supprimé avec succès' });
});

// @desc    Télécharger un document d'une réunion
// @route   GET /api/reunions/:id/documents/:documentId
// @access  Private/Admin
const getDocument = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier que l'admin appartient au même organisme
  if (reunion.organisme !== req.user.organisme && req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Non autorisé à accéder à ce document');
  }

  const document = reunion.documents.find(
    (doc) => doc._id.toString() === req.params.documentId
  );

  if (!document) {
    res.status(404);
    throw new Error('Document non trouvé');
  }

  try {
    // Générer une URL signée
    const signedUrl = await s3Service.getSignedUrl(document.key, 3600);

    res.json({
      url: signedUrl,
      nom: document.nomOriginal,
      type: document.type,
      taille: document.taille,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('Erreur génération URL:', error);
    res.status(500);
    throw new Error('Erreur lors de la génération du lien de téléchargement');
  }
});

module.exports = {
  createReunion,
  getReunions,
  getReunionById,
  updateReunion,
  deleteReunion,
  addDocument,
  deleteDocument,
  getDocument,
};
