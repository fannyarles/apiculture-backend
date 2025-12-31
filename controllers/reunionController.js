const asyncHandler = require('express-async-handler');
const Reunion = require('../models/reunionModel');
const s3Service = require('../services/s3Service');
const { generateAndUploadEmargement } = require('../services/emargementService');
const { envoyerConvocation } = require('../services/emailService');
const { generateAndUploadConvocation } = require('../services/pdfService');
const MembreConseil = require('../models/membreConseilModel');
const Organisme = require('../models/organismeModel');
const Permission = require('../models/permissionModel');

// @desc    Créer une réunion
// @route   POST /api/reunions
// @access  Private/Admin
const createReunion = asyncHandler(async (req, res) => {
  const { date, heureDebut, heureFin, type, lieu, notes, organisme } = req.body;

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
    heureDebut,
    heureFin,
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
  const { date, heureDebut, heureFin, type, lieu, notes, ordresDuJour } = req.body;

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
  reunion.heureDebut = heureDebut || reunion.heureDebut;
  reunion.heureFin = heureFin || reunion.heureFin;
  reunion.type = type || reunion.type;
  reunion.lieu = lieu || reunion.lieu;
  reunion.notes = notes !== undefined ? notes : reunion.notes;
  reunion.ordresDuJour = ordresDuJour !== undefined ? ordresDuJour : reunion.ordresDuJour;
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

// @desc    Générer une feuille d'émargement
// @route   POST /api/reunions/:id/emargement
// @access  Private/Admin
const generateEmargement = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier les permissions
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(reunion.organisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Vérifier si la date de la réunion est passée
  const reunionDate = new Date(reunion.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  reunionDate.setHours(0, 0, 0, 0);
  
  if (reunionDate < today) {
    res.status(400);
    throw new Error('Impossible de générer une feuille d\'émargement pour une réunion passée');
  }

  // Vérifier si une feuille d'émargement existe déjà
  const existingEmargement = reunion.documents.find(doc => doc.nom === "Feuille d'émargement");
  if (existingEmargement) {
    res.status(400);
    throw new Error('Une feuille d\'émargement existe déjà pour cette réunion');
  }

  try {
    // Générer et uploader la feuille d'émargement
    const documentInfo = await generateAndUploadEmargement(reunion);

    // Ajouter le document à la réunion
    reunion.documents.push(documentInfo);
    await reunion.save();

    // Récupérer la réunion mise à jour
    const updatedReunion = await Reunion.findById(reunion._id)
      .populate('creePar', 'prenom nom email')
      .populate('modifiePar', 'prenom nom email');

    res.status(201).json({
      message: 'Feuille d\'émargement générée avec succès',
      reunion: updatedReunion,
    });
  } catch (error) {
    console.error('Erreur génération émargement:', error);
    res.status(500);
    throw new Error('Erreur lors de la génération de la feuille d\'émargement');
  }
});

// @desc    Supprimer la feuille d'émargement
// @route   DELETE /api/reunions/:id/emargement
// @access  Private/Admin
const deleteEmargement = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier les permissions
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(reunion.organisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Vérifier si la date de la réunion est passée
  const reunionDate = new Date(reunion.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  reunionDate.setHours(0, 0, 0, 0);
  
  if (reunionDate < today) {
    res.status(400);
    throw new Error('Impossible de supprimer une feuille d\'émargement pour une réunion passée');
  }

  // Trouver la feuille d'émargement
  const emargementIndex = reunion.documents.findIndex(doc => doc.nom === "Feuille d'émargement");
  if (emargementIndex === -1) {
    res.status(404);
    throw new Error('Aucune feuille d\'émargement trouvée');
  }

  const emargement = reunion.documents[emargementIndex];

  try {
    // Supprimer de S3
    await s3Service.deleteFile(emargement.key);

    // Supprimer du document
    reunion.documents.splice(emargementIndex, 1);
    await reunion.save();

    // Récupérer la réunion mise à jour
    const updatedReunion = await Reunion.findById(reunion._id)
      .populate('creePar', 'prenom nom email')
      .populate('modifiePar', 'prenom nom email');

    res.json({
      message: 'Feuille d\'émargement supprimée avec succès',
      reunion: updatedReunion,
    });
  } catch (error) {
    console.error('Erreur suppression émargement:', error);
    res.status(500);
    throw new Error('Erreur lors de la suppression de la feuille d\'émargement');
  }
});

// @desc    Récupérer les membres pour convocation
// @route   GET /api/reunions/:id/membres-convocation
// @access  Private/Admin
const getMembresConvocation = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier les permissions
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(reunion.organisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Vérifier permission convoquer
  if (req.user.role !== 'super_admin') {
    const permissions = await Permission.findOne({ userId: req.user._id });
    if (!permissions?.reunions?.convoquer) {
      res.status(403);
      throw new Error('Permission de convoquer non accordée');
    }
  }

  // Récupérer les membres selon le type de réunion
  let membres = [];
  if (reunion.type === 'assemblee_generale') {
    membres = await MembreConseil.find({
      organisme: reunion.organisme,
      estBureau: true,
      actif: true,
    }).populate('adherent', 'nom prenom email');
  } else {
    membres = await MembreConseil.find({
      organisme: reunion.organisme,
      estConseil: true,
      actif: true,
    }).populate('adherent', 'nom prenom email');
  }

  // Récupérer le type d'organisme
  const organisme = await Organisme.findOne({ acronyme: reunion.organisme });

  res.json({
    membres: membres.map(m => ({
      _id: m._id,
      nom: m.adherent?.nom || '',
      prenom: m.adherent?.prenom || '',
      email: m.adherent?.email || '',
      fonction: m.fonction,
      estBureau: m.estBureau,
    })),
    typeOrganisme: organisme?.typeOrganisme || 'association',
    typeReunion: reunion.type,
  });
});

// @desc    Préparer une convocation (générer PDF + pré-remplir email)
// @route   POST /api/reunions/:id/preparer-convocation
// @access  Private/Admin
const preparerConvocation = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier les permissions
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(reunion.organisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Vérifier permission convoquer
  if (req.user.role !== 'super_admin') {
    const permissions = await Permission.findOne({ userId: req.user._id });
    if (!permissions?.reunions?.convoquer) {
      res.status(403);
      throw new Error('Permission de convoquer non accordée');
    }
  }

  // Récupérer les membres selon le type de réunion
  let membres = [];
  if (reunion.type === 'assemblee_generale') {
    membres = await MembreConseil.find({
      organisme: reunion.organisme,
      estBureau: true,
      actif: true,
    }).populate('adherent', 'nom prenom email');
  } else {
    membres = await MembreConseil.find({
      organisme: reunion.organisme,
      estConseil: true,
      actif: true,
    }).populate('adherent', 'nom prenom email');
  }

  // Préparer les données des membres pour la convocation
  const membresData = membres
    .filter(m => m.adherent)
    .map(m => ({
      membreId: m._id,
      userId: m.adherent._id,
      nom: m.adherent.nom,
      prenom: m.adherent.prenom,
      email: m.adherent.email,
      fonction: m.fonction,
      estBureau: m.estBureau,
      estConseil: m.estConseil,
    }));

  if (membresData.length === 0) {
    res.status(400);
    throw new Error('Aucun membre trouvé pour cette réunion');
  }

  try {
    // Supprimer l'ancien PDF de convocation s'il existe
    if (reunion.convocationPdf?.key) {
      try {
        await s3Service.deleteFile(reunion.convocationPdf.key);
        console.log('Ancien PDF de convocation supprimé:', reunion.convocationPdf.key);
      } catch (err) {
        console.warn('Impossible de supprimer l\'ancien PDF:', err.message);
      }
    }

    // Récupérer le président actuel de l'organisme
    const president = await MembreConseil.findOne({
      organisme: reunion.organisme,
      fonction: 'president',
      actif: true,
    }).populate('adherent', 'nom prenom');

    const presidentInfo = president?.adherent ? {
      nom: president.adherent.nom,
      prenom: president.adherent.prenom,
    } : null;

    // Générer et uploader le PDF de convocation
    const pdfResult = await generateAndUploadConvocation(reunion, membresData, presidentInfo);

    // Mettre à jour la réunion avec les infos du PDF (snapshot fait à l'envoi du mail)
    reunion.convocationPdf = {
      nom: pdfResult.fileName,
      key: pdfResult.key,
      url: pdfResult.url,
      dateGeneration: new Date(),
    };

    await reunion.save();

    // Générer le texte pré-rempli pour le mail
    const dateReunion = new Date(reunion.date);
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateFormatee = dateReunion.toLocaleDateString('fr-FR', options);
    
    // Formater le range horaire
    let heureRange = '';
    if (reunion.heureDebut && reunion.heureFin) {
      heureRange = ` de ${reunion.heureDebut} à ${reunion.heureFin}`;
    } else if (reunion.heureDebut) {
      heureRange = ` à ${reunion.heureDebut}`;
    }
    
    const typeLabel = reunion.type === 'assemblee_generale' 
      ? 'l\'Assemblée Générale' 
      : 'la Chambre Syndicale';
    
    const organismeLabel = reunion.organisme === 'SAR' 
      ? 'du SAR' 
      : 'de l\'AMAIR';

    const objetMail = `Convocation - ${reunion.type === 'assemblee_generale' ? 'Assemblée Générale' : 'Conseil Syndical'} ${organismeLabel}`;
    
    const contenuMail = `Bonjour à Tous,

Vous trouverez ci-joint l'invitation à la réunion de ${typeLabel} ${organismeLabel} qui aura lieu le ${dateFormatee}${heureRange} à ${reunion.lieu}.

${reunion.ordresDuJour ? `Ordre du jour :\n${reunion.ordresDuJour}\n\n` : ''}Cordialement,
Le Bureau`;

    res.json({
      message: 'Convocation préparée avec succès',
      pdfUrl: pdfResult.url,
      pdfKey: pdfResult.key,
      pdfFileName: pdfResult.fileName,
      membresConvoques: membresData.length,
      objetMail,
      contenuMail,
      destinataires: membresData.filter(m => m.email).map(m => ({
        nom: m.nom,
        prenom: m.prenom,
        email: m.email,
      })),
    });
  } catch (error) {
    console.error('Erreur préparation convocation:', error);
    res.status(500);
    throw new Error('Erreur lors de la préparation de la convocation');
  }
});

// @desc    Envoyer une convocation
// @route   POST /api/reunions/:id/convoquer
// @access  Private/Admin
const envoyerConvocationReunion = asyncHandler(async (req, res) => {
  const { objet, contenu, pdfKey } = req.body;

  if (!objet || !contenu) {
    res.status(400);
    throw new Error('L\'objet et le contenu sont requis');
  }

  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier les permissions
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(reunion.organisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Vérifier permission convoquer
  if (req.user.role !== 'super_admin') {
    const permissions = await Permission.findOne({ userId: req.user._id });
    if (!permissions?.reunions?.convoquer) {
      res.status(403);
      throw new Error('Permission de convoquer non accordée');
    }
  }

  // Récupérer les destinataires depuis les présences enregistrées ou les membres actifs
  let destinataires = [];
  
  if (reunion.presences && reunion.presences.length > 0) {
    destinataires = reunion.presences
      .filter(p => p.email)
      .map(p => ({
        nom: p.nom,
        prenom: p.prenom,
        email: p.email,
      }));
  } else {
    // Fallback: récupérer les membres actifs
    let membres = [];
    if (reunion.type === 'assemblee_generale') {
      membres = await MembreConseil.find({
        organisme: reunion.organisme,
        estBureau: true,
        actif: true,
      }).populate('adherent', 'nom prenom email');
    } else {
      membres = await MembreConseil.find({
        organisme: reunion.organisme,
        estConseil: true,
        actif: true,
      }).populate('adherent', 'nom prenom email');
    }
    
    destinataires = membres
      .filter(m => m.adherent?.email)
      .map(m => ({
        nom: m.adherent.nom,
        prenom: m.adherent.prenom,
        email: m.adherent.email,
      }));
  }

  if (destinataires.length === 0) {
    res.status(400);
    throw new Error('Aucun destinataire avec email valide');
  }

  // Récupérer le PDF si une clé est fournie
  let pdfAttachment = null;
  const convocationKey = pdfKey || reunion.convocationPdf?.key;
  if (convocationKey) {
    try {
      const pdfUrl = await s3Service.getSignedUrl(convocationKey);
      pdfAttachment = {
        url: pdfUrl,
        name: reunion.convocationPdf?.nom || 'convocation.pdf',
        key: convocationKey,
      };
    } catch (err) {
      console.warn('Impossible de récupérer le PDF de convocation:', err.message);
    }
  }

  try {
    const result = await envoyerConvocation(
      destinataires,
      { objet, contenu },
      reunion.organisme,
      pdfAttachment
    );

    // Enregistrer la date de convocation et faire le snapshot des présences si au moins un email a été envoyé
    if (result.emailsEnvoyes > 0) {
      reunion.dateConvocation = new Date();
      
      // Snapshot des membres pour le suivi des présences (fait au moment de l'envoi)
      let membres = [];
      if (reunion.type === 'assemblee_generale') {
        membres = await MembreConseil.find({
          organisme: reunion.organisme,
          estBureau: true,
          actif: true,
        }).populate('adherent', 'nom prenom email');
      } else {
        membres = await MembreConseil.find({
          organisme: reunion.organisme,
          estConseil: true,
          actif: true,
        }).populate('adherent', 'nom prenom email');
      }

      reunion.presences = membres
        .filter(m => m.adherent)
        .map(m => ({
          membre: m._id,
          user: m.adherent._id,
          nom: m.adherent.nom,
          prenom: m.adherent.prenom,
          email: m.adherent.email,
          fonction: m.fonction,
          estBureau: m.estBureau,
          estConseil: m.estConseil,
          statut: 'absent', // Par défaut
        }));

      await reunion.save();
    }

    // Récupérer la réunion mise à jour
    const updatedReunion = await Reunion.findById(reunion._id)
      .populate('creePar', 'prenom nom email')
      .populate('modifiePar', 'prenom nom email');

    res.json({
      message: 'Convocation envoyée avec succès',
      emailsEnvoyes: result.emailsEnvoyes,
      emailsEchoues: result.emailsEchoues,
      erreurs: result.erreurs,
      reunion: updatedReunion,
    });
  } catch (error) {
    console.error('Erreur envoi convocation:', error);
    res.status(500);
    throw new Error('Erreur lors de l\'envoi de la convocation');
  }
});

// @desc    Mettre à jour le statut de présence d'un membre
// @route   PUT /api/reunions/:id/presences/:membreId
// @access  Private/Admin
const updatePresence = asyncHandler(async (req, res) => {
  const { statut } = req.body;
  const { id, membreId } = req.params;

  if (!['present', 'absent', 'excuse'].includes(statut)) {
    res.status(400);
    throw new Error('Statut invalide. Doit être: present, absent ou excuse');
  }

  const reunion = await Reunion.findById(id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier les permissions
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(reunion.organisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Trouver le membre dans les présences
  const presenceIndex = reunion.presences.findIndex(
    p => p._id.toString() === membreId || p.membre?.toString() === membreId || p.user?.toString() === membreId
  );

  if (presenceIndex === -1) {
    res.status(404);
    throw new Error('Membre non trouvé dans cette réunion');
  }

  // Mettre à jour le statut
  reunion.presences[presenceIndex].statut = statut;
  await reunion.save();

  res.json({
    message: 'Présence mise à jour',
    presence: reunion.presences[presenceIndex],
  });
});

// @desc    Mettre à jour toutes les présences en masse
// @route   PUT /api/reunions/:id/presences
// @access  Private/Admin
const updateAllPresences = asyncHandler(async (req, res) => {
  const { presences } = req.body;
  const { id } = req.params;

  if (!Array.isArray(presences)) {
    res.status(400);
    throw new Error('Les présences doivent être un tableau');
  }

  const reunion = await Reunion.findById(id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier les permissions
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(reunion.organisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Mettre à jour chaque présence
  presences.forEach(({ membreId, statut }) => {
    if (!['present', 'absent', 'excuse'].includes(statut)) return;
    
    const presenceIndex = reunion.presences.findIndex(
      p => p._id.toString() === membreId || p.membre?.toString() === membreId || p.user?.toString() === membreId
    );
    
    if (presenceIndex !== -1) {
      reunion.presences[presenceIndex].statut = statut;
    }
  });

  await reunion.save();

  res.json({
    message: 'Présences mises à jour',
    presences: reunion.presences,
  });
});

// @desc    Récupérer le PDF de convocation
// @route   GET /api/reunions/:id/convocation-pdf
// @access  Private/Admin
const getConvocationPdf = asyncHandler(async (req, res) => {
  const reunion = await Reunion.findById(req.params.id);

  if (!reunion) {
    res.status(404);
    throw new Error('Réunion non trouvée');
  }

  // Vérifier les permissions
  const userOrganismes = req.user.organismes || [req.user.organisme];
  if (req.user.role !== 'super_admin' && !userOrganismes.includes(reunion.organisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  if (!reunion.convocationPdf?.key) {
    res.status(404);
    throw new Error('Aucun PDF de convocation disponible');
  }

  try {
    const url = await s3Service.getSignedUrl(reunion.convocationPdf.key);
    res.json({ url });
  } catch (error) {
    console.error('Erreur récupération PDF convocation:', error);
    res.status(500);
    throw new Error('Erreur lors de la récupération du PDF');
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
  generateEmargement,
  deleteEmargement,
  getMembresConvocation,
  preparerConvocation,
  envoyerConvocationReunion,
  updatePresence,
  updateAllPresences,
  getConvocationPdf,
};
