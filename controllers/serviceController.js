const asyncHandler = require('express-async-handler');
const Service = require('../models/serviceModel');
const Adhesion = require('../models/adhesionModel');
const Organisme = require('../models/organismeModel');
const Permission = require('../models/permissionModel');

// @desc    Créer une souscription à un service
// @route   POST /api/services
// @access  Private
const createService = asyncHandler(async (req, res) => {
  const {
    typeService,
    adhesionId,
    typePaiement,
    signature,
    acceptationReglement,
    informationsPersonnelles,
  } = req.body;

  // Vérifier que l'adhésion existe et appartient à l'utilisateur
  const adhesion = await Adhesion.findById(adhesionId).populate('user', 'prenom nom email');

  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  if (adhesion.user._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé - Cette adhésion ne vous appartient pas');
  }

  // Vérifier que l'adhésion est active
  if (adhesion.status !== 'actif') {
    res.status(400);
    throw new Error('Votre adhésion doit être active pour souscrire à ce service');
  }

  // Vérifier que l'adhésion correspond au bon organisme selon le service
  if (typeService === 'miellerie' && adhesion.organisme !== 'AMAIR') {
    res.status(400);
    throw new Error('Le service miellerie est réservé aux adhérents AMAIR');
  }

  if (typeService === 'assurance_unaf' && adhesion.organisme !== 'SAR') {
    res.status(400);
    throw new Error('Le service Assurance UNAF est réservé aux adhérents SAR');
  }

  // Vérifier qu'il n'existe pas déjà une souscription pour ce service/année
  const existingService = await Service.findOne({
    user: req.user._id,
    typeService,
    annee: adhesion.annee,
  });

  if (existingService) {
    res.status(400);
    throw new Error('Vous avez déjà souscrit à ce service pour cette année');
  }

  // Définir le nom et le montant selon le type de service
  let nom = '';
  let montant = 0;
  let montantCaution = 0;
  let unafData = null;

  if (typeService === 'miellerie') {
    nom = 'Services de la miellerie';
    montant = 25; // Droit d'usage
    montantCaution = 300; // Caution
  } else if (typeService === 'assurance_unaf') {
    nom = 'Assurance UNAF';
    
    // Récupérer les données UNAF depuis la requête
    const { unafOptions } = req.body;
    if (!unafOptions) {
      res.status(400);
      throw new Error('Les options UNAF sont requises');
    }

    // Calculer le montant total
    const nombreRuches = unafOptions.nombreRuches || adhesion.nombreRuches || 0;
    
    // Cotisations obligatoires
    const cotisationSyndicale = 80;
    const cotisationUNAF = 1.50;
    
    // Options facultatives
    const affairesJuridiques = unafOptions.affairesJuridiques ? 0.15 * nombreRuches : 0;
    const ecocontribution = unafOptions.ecocontribution ? 0.12 * nombreRuches : 0;
    
    // Revue
    let revueMontant = 0;
    if (unafOptions.revue === 'papier') revueMontant = 31;
    else if (unafOptions.revue === 'numerique') revueMontant = 18;
    else if (unafOptions.revue === 'papier_numerique') revueMontant = 35;
    
    // Assurance (obligatoire)
    let assurancePrixParRuche = 0;
    if (unafOptions.assuranceFormule === 'formule1') assurancePrixParRuche = 0.10;
    else if (unafOptions.assuranceFormule === 'formule2') assurancePrixParRuche = 1.65;
    else if (unafOptions.assuranceFormule === 'formule3') assurancePrixParRuche = 2.80;
    const assuranceMontant = assurancePrixParRuche * nombreRuches;

    montant = cotisationSyndicale + cotisationUNAF + affairesJuridiques + ecocontribution + revueMontant + assuranceMontant;
    montant = Math.round(montant * 100) / 100; // Arrondir à 2 décimales

    unafData = {
      siret: unafOptions.siret || adhesion.siret,
      nombreEmplacements: unafOptions.nombreEmplacements || adhesion.nombreRuchers,
      nombreRuches: nombreRuches,
      options: {
        cotisationSyndicale: { montant: cotisationSyndicale },
        cotisationUNAF: { montant: cotisationUNAF },
        affairesJuridiques: {
          souscrit: unafOptions.affairesJuridiques || false,
          prixParRuche: 0.15,
          montant: affairesJuridiques,
        },
        ecocontribution: {
          souscrit: unafOptions.ecocontribution || false,
          prixParRuche: 0.12,
          montant: ecocontribution,
        },
        revue: {
          choix: unafOptions.revue || 'aucun',
          montant: revueMontant,
        },
        assurance: {
          formule: unafOptions.assuranceFormule,
          prixParRuche: assurancePrixParRuche,
          montant: assuranceMontant,
        },
      },
      detailMontants: {
        cotisationSyndicale,
        cotisationUNAF,
        affairesJuridiques,
        ecocontribution,
        revue: revueMontant,
        assurance: assuranceMontant,
        total: montant,
      },
    };
  }

  // Créer la souscription au service
  const serviceData = {
    user: req.user._id,
    adhesion: adhesionId,
    organisme: adhesion.organisme,
    typeService,
    nom,
    annee: adhesion.annee,
    paiement: {
      montant,
      typePaiement: typePaiement || undefined,
      status: 'en_attente',
    },
    status: 'en_attente_paiement',
    signature,
    acceptationReglement: acceptationReglement || false,
    informationsPersonnelles: informationsPersonnelles || {
      nom: adhesion.informationsPersonnelles?.nom,
      prenom: adhesion.informationsPersonnelles?.prenom,
      adresse: adhesion.informationsPersonnelles?.adresse,
      telephone: adhesion.informationsPersonnelles?.telephone,
      email: adhesion.informationsPersonnelles?.email,
    },
  };

  // Ajouter la caution uniquement pour le service miellerie
  if (typeService === 'miellerie') {
    serviceData.caution = {
      montant: montantCaution,
      status: 'en_attente',
    };
  }

  // Ajouter les données UNAF si applicable
  if (unafData) {
    serviceData.unafData = unafData;
  }

  const service = await Service.create(serviceData);

  const populatedService = await Service.findById(service._id)
    .populate('user', 'prenom nom email')
    .populate('adhesion', 'organisme annee status');

  res.status(201).json(populatedService);
});

// @desc    Récupérer les services de l'utilisateur connecté
// @route   GET /api/services/my-services
// @access  Private
const getMyServices = asyncHandler(async (req, res) => {
  const services = await Service.find({ user: req.user._id })
    .populate('adhesion', 'organisme annee status')
    .sort({ createdAt: -1 });

  res.json(services);
});

// @desc    Récupérer un service par ID
// @route   GET /api/services/:id
// @access  Private
const getServiceById = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id)
    .populate('user', 'prenom nom email telephone')
    .populate('adhesion', 'organisme annee status informationsPersonnelles');

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  // Vérifier les droits d'accès
  const isOwner = service.user._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  res.json(service);
});

// @desc    Récupérer tous les services (admin)
// @route   GET /api/services
// @access  Private/Admin
const getAllServices = asyncHandler(async (req, res) => {
  const { organisme, annee, typeService, status } = req.query;

  let filter = {};

  // Filtrer par organisme selon les droits de l'admin
  if (req.user.role !== 'super_admin') {
    const userOrganismes = req.user.organismes || [req.user.organisme];
    filter.organisme = { $in: userOrganismes };
  }

  if (organisme) filter.organisme = organisme;
  if (annee) filter.annee = parseInt(annee);
  if (typeService) filter.typeService = typeService;
  if (status) filter.status = status;

  const services = await Service.find(filter)
    .populate('user', 'prenom nom email telephone')
    .populate('adhesion', 'organisme annee status')
    .sort({ createdAt: -1 });

  res.json(services);
});

// @desc    Récupérer les services d'un adhérent (par adhesionId)
// @route   GET /api/services/adhesion/:adhesionId
// @access  Private
const getServicesByAdhesion = asyncHandler(async (req, res) => {
  const { adhesionId } = req.params;

  const adhesion = await Adhesion.findById(adhesionId);
  if (!adhesion) {
    res.status(404);
    throw new Error('Adhésion non trouvée');
  }

  // Vérifier les droits d'accès
  const isOwner = adhesion.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  const services = await Service.find({ adhesion: adhesionId })
    .populate('user', 'prenom nom email')
    .sort({ createdAt: -1 });

  res.json(services);
});

// @desc    Mettre à jour le statut de la caution (admin)
// @route   PUT /api/services/:id/caution
// @access  Private/Admin
const updateCautionStatus = asyncHandler(async (req, res) => {
  const { status, dateReception, note } = req.body;

  // Vérifier les permissions
  if (req.user?.role !== 'super_admin') {
    const permissions = await Permission.findOne({ userId: req.user._id });
    if (!permissions?.adhesions?.changeAdherentStatus) {
      res.status(403);
      throw new Error('Accès refusé - Permission insuffisante');
    }
  }

  const service = await Service.findById(req.params.id)
    .populate('user', 'prenom nom email');

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  if (!['en_attente', 'recu', 'rendu'].includes(status)) {
    res.status(400);
    throw new Error('Statut de caution invalide');
  }

  service.caution.status = status;
  
  if (status === 'recu' && dateReception) {
    service.caution.dateReception = new Date(dateReception);
  }
  
  if (status === 'rendu') {
    service.caution.dateRendu = new Date();
  }

  if (note !== undefined) {
    service.caution.note = note;
  }

  // Mettre à jour le statut global du service
  const wasNotActive = service.status !== 'actif';
  if (status === 'recu' && service.paiement.status === 'paye') {
    service.status = 'actif';
    service.dateValidation = new Date();
  } else if (service.paiement.status === 'paye' && status !== 'recu') {
    service.status = 'en_attente_caution';
  }

  await service.save();

  // Générer l'attestation si le service vient de passer en actif
  if (wasNotActive && service.status === 'actif') {
    try {
      const { generateAndUploadServiceAttestation } = require('../services/pdfService');
      const populatedService = await Service.findById(service._id)
        .populate('user', 'prenom nom email telephone adresse');
      const attestationResult = await generateAndUploadServiceAttestation(populatedService);
      service.attestationKey = attestationResult.key;
      service.attestationUrl = attestationResult.url;
      await service.save();
    } catch (attestationError) {
      console.error('Erreur génération attestation service:', attestationError);
    }
  }

  res.json({
    success: true,
    service,
  });
});

// @desc    Récupérer les infos pour l'affichage admin (services miellerie par adhérent)
// @route   GET /api/services/admin/miellerie-status
// @access  Private/Admin
const getMiellerieStatusByAdhesion = asyncHandler(async (req, res) => {
  let filter = {
    typeService: 'miellerie',
  };

  // Filtrer par organisme selon les droits de l'admin
  if (req.user.role !== 'super_admin') {
    const userOrganismes = req.user.organismes || [req.user.organisme];
    filter.organisme = { $in: userOrganismes };
  }

  const services = await Service.find(filter)
    .populate('user', '_id')
    .select('user annee status caution.status');

  // Créer un map indexé par {userId}_{annee} pour correspondre à chaque adhésion
  const servicesByUserAndYear = {};
  services.forEach(service => {
    const key = `${service.user._id.toString()}_${service.annee}`;
    servicesByUserAndYear[key] = {
      status: service.status,
      cautionStatus: service.caution.status,
    };
  });

  res.json(servicesByUserAndYear);
});

// @desc    Récupérer tous les services par adhésion (pour l'affichage admin)
// @route   GET /api/services/admin/services-status
// @access  Private/Admin
const getServicesStatusByAdhesion = asyncHandler(async (req, res) => {
  let filter = {};

  // Filtrer par organisme selon les droits de l'admin
  if (req.user.role !== 'super_admin') {
    const userOrganismes = req.user.organismes || [req.user.organisme];
    filter.organisme = { $in: userOrganismes };
  }

  const services = await Service.find(filter)
    .populate('user', '_id')
    .select('user annee status typeService organisme');

  // Créer un map indexé par {adhesionKey} pour correspondre à chaque adhésion
  // adhesionKey = {userId}_{organisme}_{annee}
  const servicesByAdhesion = {};
  services.forEach(service => {
    const key = `${service.user._id.toString()}_${service.organisme}_${service.annee}`;
    if (!servicesByAdhesion[key]) {
      servicesByAdhesion[key] = [];
    }
    servicesByAdhesion[key].push({
      typeService: service.typeService,
      status: service.status,
    });
  });

  res.json(servicesByAdhesion);
});

// @desc    Récupérer l'adresse de l'AMAIR pour l'envoi du chèque de caution
// @route   GET /api/services/amair-address
// @access  Private
const getAMAIRAddress = asyncHandler(async (req, res) => {
  const organisme = await Organisme.findOne({ acronyme: 'AMAIR' });

  if (!organisme) {
    res.status(404);
    throw new Error('Informations AMAIR non trouvées');
  }

  res.json({
    nom: organisme.nom,
    adresse: organisme.adresse,
    telephone: organisme.telephone,
    email: organisme.email,
  });
});

// @desc    Vérifier si l'utilisateur peut souscrire au service miellerie
// @route   GET /api/services/can-subscribe/miellerie
// @access  Private
const canSubscribeMiellerie = asyncHandler(async (req, res) => {
  // Chercher une adhésion AMAIR active pour l'année en cours
  const currentYear = new Date().getFullYear();
  
  const adhesionAMAIR = await Adhesion.findOne({
    user: req.user._id,
    organisme: 'AMAIR',
    status: 'actif',
    annee: currentYear,
  });

  if (!adhesionAMAIR) {
    return res.json({
      canSubscribe: false,
      reason: 'Vous devez avoir une adhésion AMAIR active pour l\'année en cours',
      adhesion: null,
    });
  }

  // Vérifier si l'utilisateur n'a pas déjà souscrit
  const existingService = await Service.findOne({
    user: req.user._id,
    typeService: 'miellerie',
    annee: currentYear,
  });

  if (existingService) {
    return res.json({
      canSubscribe: false,
      reason: 'Vous avez déjà souscrit aux services de la miellerie pour cette année',
      adhesion: adhesionAMAIR,
      existingService,
    });
  }

  res.json({
    canSubscribe: true,
    adhesion: {
      _id: adhesionAMAIR._id,
      annee: adhesionAMAIR.annee,
      organisme: adhesionAMAIR.organisme,
    },
  });
});

// @desc    Vérifier si l'utilisateur peut souscrire au service Assurance UNAF
// @route   GET /api/services/can-subscribe/assurance-unaf
// @access  Private
const canSubscribeUNAF = asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();
  
  // Chercher une adhésion SAR active pour l'année en cours
  const adhesionSAR = await Adhesion.findOne({
    user: req.user._id,
    organisme: 'SAR',
    status: 'actif',
    annee: currentYear,
  });

  if (!adhesionSAR) {
    return res.json({
      canSubscribe: false,
      reason: 'Vous devez avoir une adhésion SAR active pour l\'année en cours',
      adhesion: null,
    });
  }

  // Vérifier si l'utilisateur n'a pas déjà souscrit
  const existingService = await Service.findOne({
    user: req.user._id,
    typeService: 'assurance_unaf',
    annee: currentYear,
  });

  if (existingService) {
    return res.json({
      canSubscribe: false,
      reason: 'Vous avez déjà souscrit à l\'Assurance UNAF pour cette année',
      adhesion: adhesionSAR,
      existingService,
    });
  }

  // Retourner les données pré-remplies depuis l'adhésion SAR
  res.json({
    canSubscribe: true,
    adhesion: {
      _id: adhesionSAR._id,
      annee: adhesionSAR.annee,
      organisme: adhesionSAR.organisme,
    },
    prefillData: {
      siret: adhesionSAR.siret || '',
      nombreEmplacements: adhesionSAR.nombreRuchers || 0,
      nombreRuches: adhesionSAR.nombreRuches || 0,
    },
  });
});

module.exports = {
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
};
