const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Adhesion = require('../models/adhesionModel');
const Permission = require('../models/permissionModel');
const Organisme = require('../models/organismeModel');
const s3Service = require('../services/s3Service');
const PDFDocument = require('pdfkit');

// Titres disponibles par organisme
const TITRES_PAR_ORGANISME = {
  SAR: ['membre du conseil syndical', 'membre du bureau'],
  AMAIR: ['membre du conseil d\'administration', 'membre coopté', 'membre du bureau'],
};

// Fonctions disponibles (uniquement si membre du bureau)
const FONCTIONS_BUREAU = [
  'président',
  'vice-président',
  'secrétaire',
  'secrétaire-adjoint',
  'trésorier',
  'trésorier-adjoint',
];

// @desc    Vérifier la permission de modifier les infos statutaires
const checkStatutairePermission = async (user, organisme) => {
  if (user.role === 'super_admin') return true;
  
  const permissions = await Permission.findOne({ userId: user._id });
  if (!permissions?.gestionActivite?.modifierInfosStatutaires) return false;
  
  // Vérifier que l'admin gère cet organisme
  if (!user.organismes?.includes(organisme)) return false;
  
  return true;
};

// @desc    Récupérer la composition d'un organisme (public)
// @route   GET /api/composition/:organisme
// @access  Public
const getComposition = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const membres = await User.find({
    'rolesStatutaires.organisme': organisme,
  }).select('prenom nom rolesStatutaires');

  // Formater les données pour l'affichage
  const composition = membres.map(membre => {
    const roles = membre.rolesStatutaires.filter(r => r.organisme === organisme);
    return {
      userId: membre._id,
      prenom: membre.prenom,
      nom: membre.nom,
      roles: roles.map(r => ({
        titre: r.titre,
        fonction: r.fonction,
        dateDebut: r.dateDebut,
      })),
    };
  });

  // Trier : bureau d'abord (par fonction), puis conseil
  const ordrefonctions = ['président', 'vice-président', 'secrétaire', 'secrétaire-adjoint', 'trésorier', 'trésorier-adjoint'];
  
  composition.sort((a, b) => {
    const aHasBureau = a.roles.some(r => r.titre === 'membre du bureau');
    const bHasBureau = b.roles.some(r => r.titre === 'membre du bureau');
    
    if (aHasBureau && !bHasBureau) return -1;
    if (!aHasBureau && bHasBureau) return 1;
    
    if (aHasBureau && bHasBureau) {
      const aFonction = a.roles.find(r => r.fonction)?.fonction;
      const bFonction = b.roles.find(r => r.fonction)?.fonction;
      return ordrefonctions.indexOf(aFonction) - ordrefonctions.indexOf(bFonction);
    }
    
    return a.nom.localeCompare(b.nom);
  });

  res.json(composition);
});

// @desc    Récupérer les adhérents éligibles (actifs) pour un organisme
// @route   GET /api/composition/:organisme/eligible
// @access  Private/Admin
const getEligibleMembers = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const hasPermission = await checkStatutairePermission(req.user, organisme);
  if (!hasPermission) {
    res.status(403);
    throw new Error('Accès refusé - Permission insuffisante');
  }

  const anneeEnCours = new Date().getFullYear();

  // Trouver les adhésions actives pour cet organisme
  const adhesionsActives = await Adhesion.find({
    organisme,
    annee: anneeEnCours,
    status: 'actif',
  }).populate('user', 'prenom nom email rolesStatutaires');

  const membres = adhesionsActives
    .filter(a => a.user)
    .map(a => ({
      userId: a.user._id,
      prenom: a.user.prenom,
      nom: a.user.nom,
      email: a.user.email,
      rolesActuels: a.user.rolesStatutaires?.filter(r => r.organisme === organisme) || [],
    }));

  res.json({
    membres,
    titresDisponibles: TITRES_PAR_ORGANISME[organisme],
    fonctionsDisponibles: FONCTIONS_BUREAU,
  });
});

// @desc    Ajouter un rôle statutaire à un membre
// @route   POST /api/composition/:organisme/role
// @access  Private/Admin
const addRole = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  const { userId, titre, fonction } = req.body;

  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const hasPermission = await checkStatutairePermission(req.user, organisme);
  if (!hasPermission) {
    res.status(403);
    throw new Error('Accès refusé - Permission insuffisante');
  }

  // Valider le titre
  if (!TITRES_PAR_ORGANISME[organisme].includes(titre)) {
    res.status(400);
    throw new Error('Titre invalide pour cet organisme');
  }

  // Valider la fonction (uniquement si membre du bureau)
  if (fonction && titre !== 'membre du bureau') {
    res.status(400);
    throw new Error('Une fonction ne peut être attribuée qu\'à un membre du bureau');
  }

  if (fonction && !FONCTIONS_BUREAU.includes(fonction)) {
    res.status(400);
    throw new Error('Fonction invalide');
  }

  // Vérifier que l'utilisateur est adhérent actif
  const anneeEnCours = new Date().getFullYear();
  const adhesionActive = await Adhesion.findOne({
    user: userId,
    organisme,
    annee: anneeEnCours,
    status: 'actif',
  });

  if (!adhesionActive) {
    res.status(400);
    throw new Error('Cet utilisateur n\'est pas un adhérent actif de cet organisme');
  }

  // Générer le PDF de l'historique AVANT modification
  await generateCompositionPDF(organisme);

  // Ajouter le rôle
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  // Vérifier si ce rôle existe déjà
  const roleExiste = user.rolesStatutaires?.some(
    r => r.organisme === organisme && r.titre === titre && r.fonction === fonction
  );

  if (roleExiste) {
    res.status(400);
    throw new Error('Ce rôle existe déjà pour ce membre');
  }

  user.rolesStatutaires = user.rolesStatutaires || [];
  user.rolesStatutaires.push({
    organisme,
    titre,
    fonction: fonction || null,
    dateDebut: new Date(),
  });

  await user.save();

  res.status(201).json({
    success: true,
    message: 'Rôle ajouté avec succès',
    user: {
      _id: user._id,
      prenom: user.prenom,
      nom: user.nom,
      rolesStatutaires: user.rolesStatutaires,
    },
  });
});

// @desc    Supprimer un rôle statutaire d'un membre
// @route   DELETE /api/composition/:organisme/role/:userId/:roleIndex
// @access  Private/Admin
const removeRole = asyncHandler(async (req, res) => {
  const { organisme, userId, roleIndex } = req.params;

  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const hasPermission = await checkStatutairePermission(req.user, organisme);
  if (!hasPermission) {
    res.status(403);
    throw new Error('Accès refusé - Permission insuffisante');
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  // Générer le PDF de l'historique AVANT modification
  await generateCompositionPDF(organisme);

  // Trouver et supprimer le rôle
  const rolesOrganisme = user.rolesStatutaires?.filter(r => r.organisme === organisme) || [];
  const indexNum = parseInt(roleIndex);

  if (indexNum < 0 || indexNum >= rolesOrganisme.length) {
    res.status(400);
    throw new Error('Index de rôle invalide');
  }

  // Trouver l'index réel dans le tableau complet
  let compteur = 0;
  let indexReel = -1;
  for (let i = 0; i < user.rolesStatutaires.length; i++) {
    if (user.rolesStatutaires[i].organisme === organisme) {
      if (compteur === indexNum) {
        indexReel = i;
        break;
      }
      compteur++;
    }
  }

  if (indexReel >= 0) {
    user.rolesStatutaires.splice(indexReel, 1);
    await user.save();
  }

  res.json({
    success: true,
    message: 'Rôle supprimé avec succès',
    user: {
      _id: user._id,
      prenom: user.prenom,
      nom: user.nom,
      rolesStatutaires: user.rolesStatutaires,
    },
  });
});

// @desc    Récupérer les rôles statutaires d'un utilisateur
// @route   GET /api/composition/user/:userId
// @access  Private/Admin
const getUserRoles = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId).select('prenom nom rolesStatutaires');
  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  res.json({
    userId: user._id,
    prenom: user.prenom,
    nom: user.nom,
    rolesStatutaires: user.rolesStatutaires || [],
  });
});

// @desc    Générer et stocker le PDF de composition
const generateCompositionPDF = async (organisme) => {
  try {
    // Récupérer la composition actuelle
    const membres = await User.find({
      'rolesStatutaires.organisme': organisme,
    }).select('prenom nom rolesStatutaires');

    if (membres.length === 0) {
      console.log(`Pas de membres à archiver pour ${organisme}`);
      return null;
    }

    // Récupérer les infos de l'organisme
    const orgInfo = await Organisme.findOne({ acronyme: organisme });

    // Créer le PDF
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));

    // Titre
    doc.fontSize(20).font('Helvetica-Bold')
      .text(`Composition du conseil et du bureau`, { align: 'center' });
    doc.fontSize(16).font('Helvetica')
      .text(orgInfo?.nom || organisme, { align: 'center' });
    doc.moveDown();

    // Date
    const dateStr = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    doc.fontSize(12).text(`Date : ${dateStr}`, { align: 'right' });
    doc.moveDown(2);

    // Séparer bureau et conseil
    const membresBureau = [];
    const membresConseil = [];

    membres.forEach(membre => {
      const roles = membre.rolesStatutaires.filter(r => r.organisme === organisme);
      roles.forEach(role => {
        const entry = {
          nom: `${membre.prenom} ${membre.nom}`,
          titre: role.titre,
          fonction: role.fonction,
        };
        if (role.titre === 'membre du bureau') {
          membresBureau.push(entry);
        } else {
          membresConseil.push(entry);
        }
      });
    });

    // Bureau
    if (membresBureau.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Membres du bureau');
      doc.moveDown(0.5);
      
      const ordreFonctions = ['président', 'vice-président', 'secrétaire', 'secrétaire-adjoint', 'trésorier', 'trésorier-adjoint'];
      membresBureau.sort((a, b) => ordreFonctions.indexOf(a.fonction) - ordreFonctions.indexOf(b.fonction));
      
      membresBureau.forEach(m => {
        const fonctionStr = m.fonction ? ` - ${m.fonction.charAt(0).toUpperCase() + m.fonction.slice(1)}` : '';
        doc.fontSize(12).font('Helvetica').text(`• ${m.nom}${fonctionStr}`);
      });
      doc.moveDown();
    }

    // Conseil
    if (membresConseil.length > 0) {
      const titreConseil = organisme === 'SAR' ? 'Membres du conseil syndical' : 'Membres du conseil d\'administration';
      doc.fontSize(14).font('Helvetica-Bold').text(titreConseil);
      doc.moveDown(0.5);
      
      membresConseil.sort((a, b) => a.nom.localeCompare(b.nom));
      
      membresConseil.forEach(m => {
        doc.fontSize(12).font('Helvetica').text(`• ${m.nom}`);
      });
    }

    doc.end();

    // Attendre la fin de la génération
    const pdfBuffer = await new Promise((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    // Upload vers S3
    const dateFile = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const fileName = `${dateFile}_${timestamp}_composition.pdf`;

    const result = await s3Service.uploadFile(
      pdfBuffer,
      fileName,
      'application/pdf',
      `compositions/${organisme}`
    );

    console.log(`✅ PDF de composition archivé: ${result.key}`);
    return result.key;
  } catch (error) {
    console.error('Erreur lors de la génération du PDF de composition:', error);
    return null;
  }
};

// @desc    Lister les PDF de composition archivés
// @route   GET /api/composition/:organisme/historique
// @access  Private/Admin avec permission consulterCompositions
const getCompositionHistorique = asyncHandler(async (req, res) => {
  const { organisme } = req.params;

  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  // Vérifier les permissions
  const permissions = await Permission.findOne({ userId: req.user._id });
  const isSuperAdmin = req.user.role === 'super_admin';
  const hasPermission = permissions?.gestionActivite?.consulterCompositions;
  const managesOrganisme = req.user.organismes?.includes(organisme);

  if (!isSuperAdmin && (!hasPermission || !managesOrganisme)) {
    res.status(403);
    throw new Error('Non autorisé à consulter l\'historique de cet organisme');
  }

  try {
    // Lister les fichiers dans le dossier compositions/{organisme}/
    const files = await s3Service.listFiles(`compositions/${organisme}/`);

    // Transformer et trier les fichiers
    const historique = files
      .filter(f => f.Key.endsWith('.pdf'))
      .map(f => {
        // Extraire la date du nom de fichier (format: compositions/SAR/2024-12-22_1703270400000_composition.pdf)
        const fileName = f.Key.split('/').pop();
        const datePart = fileName.split('_')[0];
        
        return {
          key: f.Key,
          fileName: fileName,
          date: datePart,
          size: f.Size,
          lastModified: f.LastModified,
        };
      })
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json(historique);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    res.status(500);
    throw new Error('Erreur lors de la récupération de l\'historique');
  }
});

// @desc    Télécharger un PDF de composition archivé
// @route   GET /api/composition/:organisme/historique/download
// @access  Private/Admin avec permission consulterCompositions
const downloadCompositionPDF = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  const { key } = req.query;

  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  if (!key) {
    res.status(400);
    throw new Error('Clé du fichier requise');
  }

  // Vérifier que la clé correspond bien à l'organisme demandé
  if (!key.startsWith(`compositions/${organisme}/`)) {
    res.status(403);
    throw new Error('Accès non autorisé à ce fichier');
  }

  // Vérifier les permissions
  const permissions = await Permission.findOne({ userId: req.user._id });
  const isSuperAdmin = req.user.role === 'super_admin';
  const hasPermission = permissions?.gestionActivite?.consulterCompositions;
  const managesOrganisme = req.user.organismes?.includes(organisme);

  if (!isSuperAdmin && (!hasPermission || !managesOrganisme)) {
    res.status(403);
    throw new Error('Non autorisé à télécharger ce fichier');
  }

  try {
    // Générer une URL signée valide 1 heure
    const signedUrl = await s3Service.getSignedUrl(key, 3600);

    res.json({
      url: signedUrl,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('Erreur lors de la génération de l\'URL:', error);
    res.status(500);
    throw new Error('Erreur lors de la génération du lien de téléchargement');
  }
});

module.exports = {
  getComposition,
  getEligibleMembers,
  addRole,
  removeRole,
  getUserRoles,
  generateCompositionPDF,
  getCompositionHistorique,
  downloadCompositionPDF,
  TITRES_PAR_ORGANISME,
  FONCTIONS_BUREAU,
};
