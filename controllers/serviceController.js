const asyncHandler = require('express-async-handler');
const Service = require('../models/serviceModel');
const Adhesion = require('../models/adhesionModel');
const Organisme = require('../models/organismeModel');
const Permission = require('../models/permissionModel');
const { uploadFile, getSignedUrl } = require('../services/s3Service');

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
    throw new Error('Les services de l\'UNAF sont réservés aux adhérents SAR');
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
    nom = 'Services de l\'UNAF';
    
    // Récupérer les données UNAF depuis la requête
    const { unafOptions } = req.body;
    if (!unafOptions) {
      res.status(400);
      throw new Error('Les options UNAF sont requises');
    }

    // Calculer le montant total
    const nombreRuches = unafOptions.nombreRuches || adhesion.nombreRuches || 0;
    
    // Cotisation obligatoire
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

    montant = cotisationUNAF + affairesJuridiques + ecocontribution + revueMontant + assuranceMontant;
    montant = Math.round(montant * 100) / 100; // Arrondir à 2 décimales

    // Vérifier le montant minimum Stripe (0,50€)
    if (montant < 0.50) {
      res.status(400);
      throw new Error(`Le montant total (${montant.toFixed(2)}€) est inférieur au minimum requis de 0,50€ pour le paiement en ligne. Veuillez ajouter d'autres options ou augmenter le nombre de ruches.`);
    }

    const optionsData = {
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
    };

    unafData = {
      // SIRET uniquement si écocontribution est active
      siret: unafOptions.ecocontribution ? (unafOptions.siret || adhesion.siret || '') : '',
      napi: unafOptions.napi || '',
      nombreEmplacements: unafOptions.nombreEmplacements || adhesion.nombreRuchers,
      nombreRuches: nombreRuches,
      options: optionsData,
      optionsInitiales: optionsData, // Sauvegarder les options initiales pour l'historique
      detailMontants: {
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

  // Gérer l'upload du document de preuve de caution
  if (req.file && status === 'recu') {
    try {
      const fileExtension = req.file.originalname.split('.').pop();
      const timestamp = Date.now();
      const fileName = `${timestamp}-preuve_caution_${service._id}.${fileExtension}`;
      const s3Key = `cautions/${fileName}`;
      
      await uploadFile(req.file.buffer, s3Key, req.file.mimetype);
      const signedUrl = await getSignedUrl(s3Key);
      
      service.caution.documentPreuve = {
        key: s3Key,
        url: signedUrl,
        nom: req.file.originalname,
        dateUpload: new Date(),
      };
      
      console.log(`✅ Document preuve caution uploadé: ${s3Key}`);
    } catch (uploadError) {
      console.error('Erreur upload document caution:', uploadError);
    }
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
      const { generateAndUploadServiceAttestation, generateAndUploadEcocontributionAttestation } = require('../services/pdfService');
      const populatedService = await Service.findById(service._id)
        .populate('user', 'type prenom nom email telephoneMobile telephone adresse designation raisonSociale');
      const attestationResult = await generateAndUploadServiceAttestation(populatedService);
      service.attestationKey = attestationResult.key;
      service.attestationUrl = attestationResult.url;
      
      // Si c'est un service UNAF avec écocontribution, générer l'attestation écocontribution
      if (populatedService.typeService === 'assurance_unaf' && populatedService.unafData?.options?.ecocontribution?.souscrit) {
        try {
          const ecoResult = await generateAndUploadEcocontributionAttestation(populatedService);
          service.ecocontributionAttestationKey = ecoResult.key;
          service.ecocontributionAttestationUrl = ecoResult.url;
          console.log('Attestation écocontribution générée:', ecoResult.fileName);
        } catch (ecoError) {
          console.error('Erreur génération attestation écocontribution:', ecoError);
        }
      }
      
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

// @desc    Vérifier si l'utilisateur peut souscrire au services de l'UNAF
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
      reason: 'Vous avez déjà souscrit aux services de l\'UNAF pour cette année',
      adhesion: adhesionSAR,
      existingService,
    });
  }

  // Retourner les données pré-remplies depuis l'adhésion SAR et le profil utilisateur
  res.json({
    canSubscribe: true,
    adhesion: {
      _id: adhesionSAR._id,
      annee: adhesionSAR.annee,
      organisme: adhesionSAR.organisme,
    },
    prefillData: {
      siret: adhesionSAR.siret || req.user.siret || '',
      napi: adhesionSAR.napi || req.user.napi || '',
      nombreEmplacements: adhesionSAR.nombreRuchers || 0,
      nombreRuches: adhesionSAR.nombreRuches || 0,
    },
  });
});

// @desc    Modifier une souscription UNAF existante
// @route   PUT /api/services/:serviceId/modify-unaf
// @access  Private
const modifyUNAFSubscription = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { modifications, signature } = req.body;

  // Récupérer le service existant
  const service = await Service.findById(serviceId);

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  // Vérifier que c'est bien un service UNAF
  if (service.typeService !== 'assurance_unaf') {
    res.status(400);
    throw new Error('Ce service n\'est pas un service UNAF');
  }

  // Vérifier que l'utilisateur est propriétaire
  if (service.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  // Récupérer les données actuelles
  const currentOptions = service.unafData?.options || {};
  const nombreRuches = service.unafData?.nombreRuches || 0;

  // Tarifs
  const TARIFS = {
    cotisationUNAF: 1.50,
    affairesJuridiques: 0.15,
    ecocontribution: 0.12,
    revue: { papier: 31, numerique: 18, papier_numerique: 35, aucun: 0 },
    assurance: { formule1: 0.10, formule2: 1.65, formule3: 2.80 },
  };

  // Ordre des formules pour validation upgrade
  const formuleOrder = { formule1: 1, formule2: 2, formule3: 3 };

  // Valider les modifications
  const errors = [];

  // Vérifier upgrade formule assurance (uniquement formule supérieure)
  if (modifications.assuranceFormule) {
    const currentFormule = currentOptions.assurance?.formule;
    const newFormule = modifications.assuranceFormule;
    if (formuleOrder[newFormule] <= formuleOrder[currentFormule]) {
      errors.push('Vous ne pouvez passer qu\'à une formule supérieure');
    }
  }

  // Vérifier revue (uniquement si aucune option sélectionnée initialement)
  if (modifications.revue) {
    const currentRevue = currentOptions.revue?.choix;
    if (currentRevue && currentRevue !== 'aucun') {
      errors.push('Vous avez déjà choisi une option de revue');
    }
  }

  // Vérifier affaires juridiques (uniquement si non coché initialement)
  if (modifications.affairesJuridiques === true) {
    if (currentOptions.affairesJuridiques?.souscrit) {
      errors.push('Vous avez déjà souscrit aux affaires juridiques');
    }
  }

  // Vérifier écocontribution (uniquement si non cochée initialement)
  if (modifications.ecocontribution === true) {
    if (currentOptions.ecocontribution?.souscrit) {
      errors.push('Vous avez déjà souscrit à l\'écocontribution');
    }
  }

  if (errors.length > 0) {
    res.status(400);
    throw new Error(errors.join('. '));
  }

  // Calculer le montant supplémentaire
  let montantSupplementaire = 0;
  const modificationsEffectuees = {
    formuleAvant: currentOptions.assurance?.formule,
    formuleApres: currentOptions.assurance?.formule,
    revueAvant: currentOptions.revue?.choix,
    revueApres: currentOptions.revue?.choix,
    affairesJuridiquesAvant: currentOptions.affairesJuridiques?.souscrit || false,
    affairesJuridiquesApres: currentOptions.affairesJuridiques?.souscrit || false,
    ecocontributionAvant: currentOptions.ecocontribution?.souscrit || false,
    ecocontributionApres: currentOptions.ecocontribution?.souscrit || false,
  };

  // Calculer différence formule assurance
  if (modifications.assuranceFormule && modifications.assuranceFormule !== currentOptions.assurance?.formule) {
    const ancienPrix = TARIFS.assurance[currentOptions.assurance?.formule] || 0;
    const nouveauPrix = TARIFS.assurance[modifications.assuranceFormule] || 0;
    montantSupplementaire += (nouveauPrix - ancienPrix) * nombreRuches;
    modificationsEffectuees.formuleApres = modifications.assuranceFormule;
  }

  // Calculer ajout revue
  if (modifications.revue && modifications.revue !== 'aucun' && (!currentOptions.revue?.choix || currentOptions.revue?.choix === 'aucun')) {
    montantSupplementaire += TARIFS.revue[modifications.revue] || 0;
    modificationsEffectuees.revueApres = modifications.revue;
  }

  // Calculer ajout affaires juridiques
  if (modifications.affairesJuridiques === true && !currentOptions.affairesJuridiques?.souscrit) {
    montantSupplementaire += TARIFS.affairesJuridiques * nombreRuches;
    modificationsEffectuees.affairesJuridiquesApres = true;
  }

  // Calculer ajout écocontribution
  if (modifications.ecocontribution === true && !currentOptions.ecocontribution?.souscrit) {
    montantSupplementaire += TARIFS.ecocontribution * nombreRuches;
    modificationsEffectuees.ecocontributionApres = true;
    // Stocker le SIRET si écocontribution est ajoutée
    if (modifications.siret) {
      modificationsEffectuees.siret = modifications.siret;
    }
  }
  
  // Stocker le NAPI s'il est fourni
  if (modifications.napi) {
    modificationsEffectuees.napi = modifications.napi;
  }

  montantSupplementaire = Math.round(montantSupplementaire * 100) / 100;

  if (montantSupplementaire <= 0) {
    res.status(400);
    throw new Error('Aucune modification à effectuer');
  }

  // Vérifier le montant minimum Stripe (0,50€)
  if (montantSupplementaire < 0.50) {
    res.status(400);
    throw new Error(`Le montant de la modification (${montantSupplementaire.toFixed(2)}€) est inférieur au minimum requis de 0,50€ pour le paiement en ligne. Veuillez ajouter d'autres options ou contacter l'administration.`);
  }

  // Créer l'entrée dans l'historique
  const historiqueEntry = {
    date: new Date(),
    type: 'modification',
    modifications: modificationsEffectuees,
    montantSupplementaire,
    paiement: {
      status: 'en_attente',
    },
    signature,
    signatureDate: signature ? new Date() : null,
  };

  // Ajouter à l'historique
  if (!service.historiqueModifications) {
    service.historiqueModifications = [];
  }
  service.historiqueModifications.push(historiqueEntry);
  await service.save();

  // Retourner les infos pour le paiement
  res.json({
    success: true,
    message: 'Modification enregistrée, en attente de paiement',
    serviceId: service._id,
    historiqueEntryIndex: service.historiqueModifications.length - 1,
    montantSupplementaire,
    modifications: modificationsEffectuees,
  });
});

// @desc    Confirmer le paiement d'une modification UNAF et appliquer les changements
// @route   POST /api/services/:serviceId/confirm-modification
// @access  Private
const confirmUNAFModification = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { historiqueEntryIndex, stripePaymentIntentId } = req.body;

  const service = await Service.findById(serviceId);

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  if (service.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  const historiqueEntry = service.historiqueModifications[historiqueEntryIndex];
  if (!historiqueEntry) {
    res.status(404);
    throw new Error('Modification non trouvée');
  }

  if (historiqueEntry.paiement.status === 'paye') {
    res.status(400);
    throw new Error('Cette modification a déjà été payée');
  }

  // Tarifs pour recalculer les montants
  const TARIFS = {
    cotisationUNAF: 1.50,
    affairesJuridiques: 0.15,
    ecocontribution: 0.12,
    revue: { papier: 31, numerique: 18, papier_numerique: 35, aucun: 0 },
    assurance: { formule1: 0.10, formule2: 1.65, formule3: 2.80 },
  };

  const nombreRuches = service.unafData?.nombreRuches || 0;
  const mods = historiqueEntry.modifications;

  // Appliquer les modifications
  if (mods.formuleApres !== mods.formuleAvant) {
    service.unafData.options.assurance.formule = mods.formuleApres;
    service.unafData.options.assurance.prixParRuche = TARIFS.assurance[mods.formuleApres];
    service.unafData.options.assurance.montant = TARIFS.assurance[mods.formuleApres] * nombreRuches;
    service.unafData.detailMontants.assurance = TARIFS.assurance[mods.formuleApres] * nombreRuches;
  }

  if (mods.revueApres !== mods.revueAvant) {
    service.unafData.options.revue.choix = mods.revueApres;
    service.unafData.options.revue.montant = TARIFS.revue[mods.revueApres];
    service.unafData.detailMontants.revue = TARIFS.revue[mods.revueApres];
  }

  if (mods.affairesJuridiquesApres !== mods.affairesJuridiquesAvant) {
    service.unafData.options.affairesJuridiques.souscrit = true;
    service.unafData.options.affairesJuridiques.montant = TARIFS.affairesJuridiques * nombreRuches;
    service.unafData.detailMontants.affairesJuridiques = TARIFS.affairesJuridiques * nombreRuches;
  }

  if (mods.ecocontributionApres !== mods.ecocontributionAvant) {
    service.unafData.options.ecocontribution.souscrit = true;
    service.unafData.options.ecocontribution.montant = TARIFS.ecocontribution * nombreRuches;
    service.unafData.detailMontants.ecocontribution = TARIFS.ecocontribution * nombreRuches;
    
    // Mettre à jour le SIRET si l'écocontribution est activée
    if (mods.ecocontributionApres === true && mods.siret) {
      service.unafData.siret = mods.siret;
    }
  }

  // Recalculer le total
  const newTotal = 
    service.unafData.detailMontants.cotisationUNAF +
    service.unafData.detailMontants.affairesJuridiques +
    service.unafData.detailMontants.ecocontribution +
    service.unafData.detailMontants.revue +
    service.unafData.detailMontants.assurance;
  
  service.unafData.detailMontants.total = Math.round(newTotal * 100) / 100;

  // Mettre à jour le paiement de l'historique
  service.historiqueModifications[historiqueEntryIndex].paiement.status = 'paye';
  service.historiqueModifications[historiqueEntryIndex].paiement.datePaiement = new Date();
  service.historiqueModifications[historiqueEntryIndex].paiement.stripePaymentIntentId = stripePaymentIntentId;

  await service.save();

  res.json({
    success: true,
    message: 'Modification appliquée avec succès',
    service,
  });
});

// @desc    Télécharger une attestation de service
// @route   GET /api/services/:id/attestation/:type
// @access  Private
const downloadServiceAttestation = asyncHandler(async (req, res) => {
  const { id, type } = req.params;

  const service = await Service.findById(id).populate('user', '_id');

  if (!service) {
    res.status(404);
    throw new Error('Service non trouvé');
  }

  // Vérifier que l'utilisateur est propriétaire ou admin
  const isOwner = service.user._id.toString() === req.user._id.toString();
  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('Non autorisé à accéder à ce fichier');
  }

  let s3Key;
  let fileName;

  if (type === 'attestation') {
    s3Key = service.attestationKey;
    fileName = `attestation-${service.typeService}-${service.annee}.pdf`;
  } else if (type === 'ecocontribution') {
    s3Key = service.ecocontributionAttestationKey;
    fileName = `attestation-ecocontribution-${service.annee}.pdf`;
  } else {
    res.status(400);
    throw new Error('Type d\'attestation invalide');
  }

  if (!s3Key) {
    res.status(404);
    throw new Error('Attestation non disponible');
  }

  try {
    const { downloadFile } = require('../services/s3Service');
    const fileBuffer = await downloadFile(s3Key);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);

    res.send(fileBuffer);
  } catch (error) {
    console.error('Erreur téléchargement attestation:', error);
    res.status(500);
    throw new Error('Erreur lors du téléchargement de l\'attestation');
  }
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
  modifyUNAFSubscription,
  confirmUNAFModification,
  downloadServiceAttestation,
};
