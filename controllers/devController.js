const asyncHandler = require('express-async-handler');
const {
  generateBulletinAdhesionPDF,
  generateAttestationPDF,
  generateServiceAttestationPDF,
  generateUNAFAttestationPDF,
} = require('../services/pdfService');
const { generateEmargementPDF } = require('../services/emargementService');

// Fake data pour les tests PDF
const FAKE_USER = {
  _id: 'fake-user-id-123',
  nom: 'DUPONT',
  prenom: 'Jean-Pierre',
  email: 'jean.dupont@example.com',
  telephone: '0692 12 34 56',
  telephoneMobile: '0692 12 34 56',
  dateNaissance: new Date('1985-06-15'),
  adresse: {
    rue: '123 Rue des Abeilles',
    complement: 'Bâtiment B',
    codePostal: '97400',
    ville: 'Saint-Denis',
    pays: 'France',
  },
};

const FAKE_ADHESION_SAR = {
  _id: 'fake-adhesion-sar-123',
  user: FAKE_USER,
  annee: 2025,
  organisme: 'SAR',
  type: 'apiculteur',
  status: 'valide',
  estNouveau: true, // true = droit d'entrée appliqué, false = exonéré (adhérent N-1)
  napi: '974ABC123456',
  numeroAmexa: 'AMEXA123456',
  siret: '12345678901234',
  nombreRuches: 25,
  nombreRuchers: 3,
  localisation: {
    departement: '974',
    commune: 'Saint-Denis',
  },
  paiement: {
    montant: 45,
    typePaiement: 'en_ligne',
    datePaiement: new Date(),
  },
  dateAdhesion: new Date(),
  dateValidation: new Date(),
  createdAt: new Date(),
  signature: null, // Pas de signature pour le test
};

const FAKE_ADHESION_AMAIR = {
  ...FAKE_ADHESION_SAR,
  _id: 'fake-adhesion-amair-123',
  organisme: 'AMAIR',
  estNouveau: false,
  informationsSpecifiques: {
    AMAIR: {
      adherentSAR: false, // Mettre à true pour tester le cas adhérent SAR gratuit
    },
  },
  paiement: {
    montant: 50,
    typePaiement: 'en_ligne',
    datePaiement: new Date(),
  },
};

const FAKE_SERVICE_UNAF = {
  _id: 'fake-service-unaf-123',
  user: FAKE_USER,
  nom: 'Assurance UNAF',
  typeService: 'assurance_unaf',
  annee: 2025,
  status: 'valide',
  informationsPersonnelles: {
    nom: FAKE_USER.nom,
    prenom: FAKE_USER.prenom,
    email: FAKE_USER.email,
    telephone: FAKE_USER.telephone,
    adresse: FAKE_USER.adresse,
  },
  unafData: {
    nombreRuches: 25,
    nombreEmplacements: 3,
    siret: '12345678901234',
    options: {
      assurance: { formule: 'formule2' },
      revue: { choix: 'papier_numerique' },
      affairesJuridiques: { souscrit: true },
      ecocontribution: { souscrit: true },
    },
    detailMontants: {
      assurance: 35,
      revue: 15,
      affairesJuridiques: 5,
      ecocontribution: 2,
      total: 57,
    },
  },
  paiement: {
    montant: 57,
    typePaiement: 'en_ligne',
    datePaiement: new Date(),
  },
  dateValidation: new Date(),
  createdAt: new Date(),
};

const FAKE_SERVICE_GENERIC = {
  _id: 'fake-service-generic-123',
  user: FAKE_USER,
  nom: 'Location Extracteur',
  typeService: 'location_materiel',
  annee: 2025,
  status: 'valide',
  informationsPersonnelles: {
    nom: FAKE_USER.nom,
    prenom: FAKE_USER.prenom,
    email: FAKE_USER.email,
    telephone: FAKE_USER.telephone,
    adresse: FAKE_USER.adresse,
  },
  paiement: {
    montant: 30,
    typePaiement: 'en_ligne',
    datePaiement: new Date(),
  },
  caution: {
    montant: 150,
    status: 'deposee',
  },
  dateValidation: new Date(),
  createdAt: new Date(),
};

const FAKE_REUNION_AG = {
  _id: 'fake-reunion-ag-123',
  date: new Date('2025-03-15'),
  type: 'assemblee_generale',
  lieu: 'Salle des fêtes de Saint-Denis',
  organisme: 'SAR',
};

const FAKE_REUNION_CONSEIL = {
  _id: 'fake-reunion-conseil-123',
  date: new Date('2025-02-20'),
  type: 'conseil_syndical',
  lieu: 'Siège du SAR - Saint-Pierre',
  organisme: 'SAR',
};

const FAKE_MEMBRES_BUREAU = [
  { adherent: { nom: 'MARTIN', prenom: 'Pierre' }, fonction: 'president' },
  { adherent: { nom: 'DURAND', prenom: 'Marie' }, fonction: 'vice_president' },
  { adherent: { nom: 'LEROY', prenom: 'Paul' }, fonction: 'secretaire' },
  { adherent: { nom: 'MOREAU', prenom: 'Sophie' }, fonction: 'tresorier' },
  { adherent: { nom: 'PETIT', prenom: 'Jacques' }, fonction: 'tresorier_adjoint' },
];

const FAKE_MEMBRES_CONSEIL = [
  ...FAKE_MEMBRES_BUREAU,
  { adherent: { nom: 'BERNARD', prenom: 'Luc' }, fonction: null },
  { adherent: { nom: 'ROBERT', prenom: 'Anne' }, fonction: null },
  { adherent: { nom: 'RICHARD', prenom: 'Marc' }, fonction: null },
  { adherent: { nom: 'DUBOIS', prenom: 'Claire' }, fonction: null },
  { adherent: { nom: 'THOMAS', prenom: 'François' }, fonction: null },
];

// Liste des types de PDF disponibles
const PDF_TYPES = {
  bulletin_sar: {
    name: 'Bulletin d\'adhésion SAR',
    description: 'Bulletin d\'adhésion au Syndicat Apicole de la Réunion',
  },
  bulletin_amair: {
    name: 'Bulletin d\'adhésion AMAIR',
    description: 'Bulletin d\'adhésion à l\'Association Maison de l\'Apiculture',
  },
  attestation_sar: {
    name: 'Attestation d\'adhésion SAR',
    description: 'Attestation officielle d\'adhésion au SAR',
  },
  attestation_amair: {
    name: 'Attestation d\'adhésion AMAIR',
    description: 'Attestation officielle d\'adhésion à l\'AMAIR',
  },
  attestation_service_unaf: {
    name: 'Attestation service UNAF',
    description: 'Attestation de souscription à l\'assurance UNAF',
  },
  attestation_service_generic: {
    name: 'Attestation service générique',
    description: 'Attestation de souscription à un service (ex: location matériel)',
  },
  emargement_ag: {
    name: 'Feuille d\'émargement AG',
    description: 'Feuille d\'émargement pour Assemblée Générale (bureau)',
  },
  emargement_conseil: {
    name: 'Feuille d\'émargement Conseil',
    description: 'Feuille d\'émargement pour Conseil Syndical',
  },
};

// @desc    Obtenir la liste des types de PDF disponibles
// @route   GET /api/dev/pdf-types
// @access  Super Admin
const getPdfTypes = asyncHandler(async (req, res) => {
  res.json(PDF_TYPES);
});

// @desc    Générer un PDF de test
// @route   GET /api/dev/generate-pdf/:type
// @access  Super Admin
const generateTestPdf = asyncHandler(async (req, res) => {
  const { type } = req.params;

  if (!PDF_TYPES[type]) {
    res.status(400);
    throw new Error(`Type de PDF invalide: ${type}`);
  }

  let pdfBuffer;
  let fileName;

  switch (type) {
    case 'bulletin_sar':
      pdfBuffer = await generateBulletinAdhesionPDF(FAKE_ADHESION_SAR);
      fileName = 'bulletin-adhesion-SAR-test.pdf';
      break;

    case 'bulletin_amair':
      pdfBuffer = await generateBulletinAdhesionPDF(FAKE_ADHESION_AMAIR);
      fileName = 'bulletin-adhesion-AMAIR-test.pdf';
      break;

    case 'attestation_sar':
      pdfBuffer = await generateAttestationPDF(FAKE_ADHESION_SAR);
      fileName = 'attestation-adhesion-SAR-test.pdf';
      break;

    case 'attestation_amair':
      pdfBuffer = await generateAttestationPDF(FAKE_ADHESION_AMAIR);
      fileName = 'attestation-adhesion-AMAIR-test.pdf';
      break;

    case 'attestation_service_unaf':
      pdfBuffer = await generateUNAFAttestationPDF(FAKE_SERVICE_UNAF);
      fileName = 'attestation-service-UNAF-test.pdf';
      break;

    case 'attestation_service_generic':
      pdfBuffer = await generateServiceAttestationPDF(FAKE_SERVICE_GENERIC);
      fileName = 'attestation-service-generic-test.pdf';
      break;

    case 'emargement_ag':
      pdfBuffer = await generateEmargementPDF(
        FAKE_REUNION_AG,
        FAKE_MEMBRES_BUREAU,
        'SAR'
      );
      fileName = 'emargement-AG-test.pdf';
      break;

    case 'emargement_conseil':
      pdfBuffer = await generateEmargementPDF(
        FAKE_REUNION_CONSEIL,
        FAKE_MEMBRES_CONSEIL,
        'SAR'
      );
      fileName = 'emargement-conseil-test.pdf';
      break;

    default:
      res.status(400);
      throw new Error(`Type de PDF non géré: ${type}`);
  }

  // Envoyer le PDF en téléchargement
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});

module.exports = {
  getPdfTypes,
  generateTestPdf,
};
