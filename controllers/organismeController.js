const asyncHandler = require('express-async-handler');
const Organisme = require('../models/organismeModel');
const User = require('../models/userModel');

// @desc    Récupérer tous les organismes
// @route   GET /api/organismes
// @access  Super Admin
const getOrganismes = asyncHandler(async (req, res) => {
  const organismes = await Organisme.find().sort({ nom: 1 });
  res.json(organismes);
});

// @desc    Récupérer un organisme par ID
// @route   GET /api/organismes/:id
// @access  Super Admin
const getOrganismeById = asyncHandler(async (req, res) => {
  const organisme = await Organisme.findById(req.params.id);

  if (organisme) {
    res.json(organisme);
  } else {
    res.status(404);
    throw new Error('Organisme non trouvé');
  }
});

// @desc    Créer un nouvel organisme
// @route   POST /api/organismes
// @access  Super Admin
const createOrganisme = asyncHandler(async (req, res) => {
  const {
    nom,
    acronyme,
    typeOrganisme,
    adresse,
    telephone,
    email,
    siteWeb,
    logo,
    description,
    siret,
    president,
  } = req.body;

  // Vérifier si l'acronyme existe déjà
  const organismeExists = await Organisme.findOne({ acronyme: acronyme.toUpperCase() });

  if (organismeExists) {
    res.status(400);
    throw new Error('Un organisme avec cet acronyme existe déjà');
  }

  const organisme = await Organisme.create({
    nom,
    acronyme: acronyme.toUpperCase(),
    typeOrganisme,
    adresse,
    telephone,
    email,
    siteWeb,
    logo,
    description,
    siret,
    president,
  });

  res.status(201).json(organisme);
});

// @desc    Mettre à jour un organisme
// @route   PUT /api/organismes/:id
// @access  Super Admin
const updateOrganisme = asyncHandler(async (req, res) => {
  const organisme = await Organisme.findById(req.params.id);

  if (!organisme) {
    res.status(404);
    throw new Error('Organisme non trouvé');
  }

  // Vérifier si le nouvel acronyme existe déjà (si changé)
  if (req.body.acronyme && req.body.acronyme.toUpperCase() !== organisme.acronyme) {
    const acronymeExists = await Organisme.findOne({ 
      acronyme: req.body.acronyme.toUpperCase(),
      _id: { $ne: req.params.id }
    });

    if (acronymeExists) {
      res.status(400);
      throw new Error('Un organisme avec cet acronyme existe déjà');
    }
  }

  // Mettre à jour les champs
  organisme.nom = req.body.nom || organisme.nom;
  organisme.acronyme = req.body.acronyme ? req.body.acronyme.toUpperCase() : organisme.acronyme;
  organisme.adresse = req.body.adresse || organisme.adresse;
  organisme.telephone = req.body.telephone || organisme.telephone;
  organisme.email = req.body.email || organisme.email;
  organisme.siteWeb = req.body.siteWeb || organisme.siteWeb;
  organisme.logo = req.body.logo || organisme.logo;
  organisme.description = req.body.description || organisme.description;
  organisme.siret = req.body.siret || organisme.siret;
  organisme.president = req.body.president || organisme.president;
  organisme.typeOrganisme = req.body.typeOrganisme || organisme.typeOrganisme;
  
  if (req.body.actif !== undefined) {
    organisme.actif = req.body.actif;
  }

  const updatedOrganisme = await organisme.save();
  res.json(updatedOrganisme);
});

// @desc    Supprimer un organisme
// @route   DELETE /api/organismes/:id
// @access  Super Admin
const deleteOrganisme = asyncHandler(async (req, res) => {
  const organisme = await Organisme.findById(req.params.id);

  if (!organisme) {
    res.status(404);
    throw new Error('Organisme non trouvé');
  }

  // Vérifier s'il y a des admins liés à cet organisme
  const adminsCount = await User.countDocuments({ 
    role: 'admin', 
    organisme: organisme.acronyme 
  });

  if (adminsCount > 0) {
    res.status(400);
    throw new Error(`Impossible de supprimer cet organisme. ${adminsCount} administrateur(s) y sont rattachés.`);
  }

  await organisme.deleteOne();
  res.json({ message: 'Organisme supprimé avec succès' });
});

// @desc    Récupérer les statistiques d'un organisme
// @route   GET /api/organismes/:id/stats
// @access  Super Admin
const getOrganismeStats = asyncHandler(async (req, res) => {
  const organisme = await Organisme.findById(req.params.id);

  if (!organisme) {
    res.status(404);
    throw new Error('Organisme non trouvé');
  }

  // Compter les admins
  const adminsCount = await User.countDocuments({ 
    role: 'admin', 
    organisme: organisme.acronyme 
  });

  // Compter les adhésions (à adapter selon votre modèle)
  const Adhesion = require('../models/adhesionModel');
  const adhesionsCount = await Adhesion.countDocuments({ 
    organisme: organisme.acronyme 
  });

  const adhesionsValidees = await Adhesion.countDocuments({ 
    organisme: organisme.acronyme,
    status: 'validée'
  });

  res.json({
    organisme: organisme.nom,
    acronyme: organisme.acronyme,
    admins: adminsCount,
    adhesions: {
      total: adhesionsCount,
      validees: adhesionsValidees,
    },
  });
});

module.exports = {
  getOrganismes,
  getOrganismeById,
  createOrganisme,
  updateOrganisme,
  deleteOrganisme,
  getOrganismeStats,
};
