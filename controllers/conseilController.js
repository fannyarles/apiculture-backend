const asyncHandler = require('express-async-handler');
const MembreConseil = require('../models/membreConseilModel');
const HistoriqueConseil = require('../models/historiqueConseilModel');
const User = require('../models/userModel');
const Adhesion = require('../models/adhesionModel');
const Reunion = require('../models/reunionModel');
const Permission = require('../models/permissionModel');
const Organisme = require('../models/organismeModel');
const PDFDocument = require('pdfkit');
const s3Service = require('../services/s3Service');

// Fonctions du bureau
const FONCTIONS_BUREAU = [
  { value: 'president', label: 'Président' },
  { value: 'vice_president', label: 'Vice-président' },
  { value: 'secretaire', label: 'Secrétaire' },
  { value: 'secretaire_adjoint', label: 'Secrétaire-adjoint' },
  { value: 'tresorier', label: 'Trésorier' },
  { value: 'tresorier_adjoint', label: 'Trésorier-adjoint' },
];

// Fractions par organisme
const FRACTIONS = {
  SAR: [
    { value: '1er_quart', label: '1er quart' },
    { value: '2e_quart', label: '2e quart' },
    { value: '3e_quart', label: '3e quart' },
    { value: '4e_quart', label: '4e quart' },
  ],
  AMAIR: [
    { value: '1er_tiers', label: '1er tiers' },
    { value: '2e_tiers', label: '2e tiers' },
    { value: '3e_tiers', label: '3e tiers' },
  ],
};

// Vérifier la permission de modifier les infos statutaires
const checkStatutairePermission = async (user, organisme) => {
  if (user.role === 'super_admin') return true;
  
  const permissions = await Permission.findOne({ userId: user._id });
  if (!permissions?.gestionActivite?.modifierInfosStatutaires) return false;
  
  if (!user.organismes?.includes(organisme)) return false;
  
  return true;
};

// @desc    Récupérer la composition d'un organisme (membres actifs et inactifs)
// @route   GET /api/conseil/:organisme
// @access  Private/Admin
const getComposition = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  const { includeInactifs } = req.query;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  let filter = { organisme };
  if (includeInactifs !== 'true') {
    filter.actif = true;
  }

  const membres = await MembreConseil.find(filter)
    .populate('adherent', 'prenom nom email')
    .populate('reunionElection', 'date type')
    .populate('reunionRetrait', 'date type')
    .sort({ 
      estBureau: -1, 
      fonction: 1, 
      'adherent.nom': 1 
    });

  // Séparer les membres actifs et inactifs
  const membresActifs = membres.filter(m => m.actif);
  const membresInactifs = membres.filter(m => !m.actif);

  // Trier les membres du bureau par fonction
  const ordreFonctions = ['president', 'vice_president', 'secretaire', 'secretaire_adjoint', 'tresorier', 'tresorier_adjoint'];
  
  membresActifs.sort((a, b) => {
    // Bureau avant conseil
    if (a.estBureau && !b.estBureau) return -1;
    if (!a.estBureau && b.estBureau) return 1;
    
    // Tri par fonction pour le bureau
    if (a.estBureau && b.estBureau) {
      return ordreFonctions.indexOf(a.fonction) - ordreFonctions.indexOf(b.fonction);
    }
    
    // Conseil avant cooptés
    if (a.estConseil && !b.estConseil) return -1;
    if (!a.estConseil && b.estConseil) return 1;
    
    // Tri alphabétique
    return a.adherent?.nom?.localeCompare(b.adherent?.nom);
  });

  res.json({
    actifs: membresActifs,
    inactifs: membresInactifs,
    fractions: FRACTIONS[organisme],
    fonctions: FONCTIONS_BUREAU,
  });
});

// @desc    Récupérer les réunions disponibles pour un organisme
// @route   GET /api/conseil/:organisme/reunions
// @access  Private/Admin
const getReunionsDisponibles = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const reunions = await Reunion.find({ organisme })
    .select('date type lieu')
    .sort({ date: -1 })
    .limit(50);

  res.json(reunions);
});

// @desc    Récupérer les adhérents éligibles pour un organisme
// @route   GET /api/conseil/:organisme/eligibles
// @access  Private/Admin
const getEligibles = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const hasPermission = await checkStatutairePermission(req.user, organisme);
  if (!hasPermission) {
    res.status(403);
    throw new Error('Accès refusé');
  }

  const anneeEnCours = new Date().getFullYear();

  // Adhérents actifs de l'organisme
  const adhesionsActives = await Adhesion.find({
    organisme,
    annee: anneeEnCours,
    status: 'actif',
  }).populate('user', 'prenom nom email');

  // Membres actuels du conseil
  const membresActuels = await MembreConseil.find({
    organisme,
    actif: true,
  }).select('adherent');

  const idsActuels = membresActuels.map(m => m.adherent.toString());

  const eligibles = adhesionsActives
    .filter(a => a.user)
    .map(a => ({
      _id: a.user._id,
      prenom: a.user.prenom,
      nom: a.user.nom,
      email: a.user.email,
      dejaMembre: idsActuels.includes(a.user._id.toString()),
    }));

  res.json(eligibles);
});

// @desc    Ajouter un membre au conseil/bureau
// @route   POST /api/conseil/:organisme/membre
// @access  Private/Admin
const ajouterMembre = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  const { 
    adherentId, 
    estConseil, 
    estBureau, 
    estCoopte, 
    fraction, 
    fonction, 
    reunionElectionId, 
    dateCooptation 
  } = req.body;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const hasPermission = await checkStatutairePermission(req.user, organisme);
  if (!hasPermission) {
    res.status(403);
    throw new Error('Accès refusé');
  }

  // Validations
  if (!adherentId) {
    res.status(400);
    throw new Error('Adhérent requis');
  }

  // Vérifier que l'adhérent existe
  const adherent = await User.findById(adherentId);
  if (!adherent) {
    res.status(404);
    throw new Error('Adhérent non trouvé');
  }

  // Coopté uniquement pour AMAIR
  if (estCoopte && organisme !== 'AMAIR') {
    res.status(400);
    throw new Error('Les membres cooptés sont uniquement pour l\'AMAIR');
  }

  // Coopté nécessite une date de cooptation
  if (estCoopte && !dateCooptation) {
    res.status(400);
    throw new Error('Date de cooptation requise pour un membre coopté');
  }

  // Membre du conseil/bureau nécessite une réunion d'élection
  if ((estConseil || estBureau) && !estCoopte && !reunionElectionId) {
    res.status(400);
    throw new Error('Réunion d\'élection requise');
  }

  // Fonction requise pour membre du bureau
  if (estBureau && !fonction) {
    res.status(400);
    throw new Error('Fonction requise pour un membre du bureau');
  }

  // Vérifier si déjà membre actif
  const dejaMembreActif = await MembreConseil.findOne({
    adherent: adherentId,
    organisme,
    actif: true,
  });

  if (dejaMembreActif) {
    res.status(400);
    throw new Error('Cet adhérent est déjà membre actif du conseil');
  }

  // Créer le membre
  const nouveauMembre = await MembreConseil.create({
    adherent: adherentId,
    organisme,
    estConseil: estConseil || false,
    estBureau: estBureau || false,
    estCoopte: estCoopte || false,
    fraction: fraction || null,
    fonction: estBureau ? fonction : null,
    reunionElection: reunionElectionId || null,
    dateCooptation: estCoopte ? dateCooptation : null,
    actif: true,
  });

  // Créer l'entrée d'historique
  let typePoste = 'conseil';
  if (estBureau) typePoste = 'bureau';
  if (estCoopte) typePoste = 'coopte';

  await HistoriqueConseil.create({
    membreConseil: nouveauMembre._id,
    adherent: adherentId,
    organisme,
    action: 'ajout',
    typePoste,
    fonction: fonction || null,
    fraction: fraction || null,
    reunion: reunionElectionId || null,
    dateCooptation: estCoopte ? dateCooptation : null,
    modifiePar: req.user._id,
  });

  // Gérer le cas spécial : président SAR = membre de droit CA AMAIR
  if (organisme === 'SAR' && fonction === 'president') {
    await gererMembreDeDroitAMAIR(adherentId, req.user._id, 'ajout');
  }

  const membrePopulated = await MembreConseil.findById(nouveauMembre._id)
    .populate('adherent', 'prenom nom email')
    .populate('reunionElection', 'date type');

  res.status(201).json(membrePopulated);
});

// @desc    Retirer un membre du conseil/bureau
// @route   PUT /api/conseil/:organisme/membre/:membreId/retrait
// @access  Private/Admin
const retirerMembre = asyncHandler(async (req, res) => {
  const { organisme, membreId } = req.params;
  const { raisonRetrait, raisonRetraitAutre, reunionRetraitId } = req.body;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const hasPermission = await checkStatutairePermission(req.user, organisme);
  if (!hasPermission) {
    res.status(403);
    throw new Error('Accès refusé');
  }

  const membre = await MembreConseil.findById(membreId);
  if (!membre) {
    res.status(404);
    throw new Error('Membre non trouvé');
  }

  if (!membre.actif) {
    res.status(400);
    throw new Error('Ce membre n\'est plus actif');
  }

  if (!raisonRetrait) {
    res.status(400);
    throw new Error('Raison du retrait requise');
  }

  if (raisonRetrait === 'autre' && !raisonRetraitAutre) {
    res.status(400);
    throw new Error('Précisez la raison du retrait');
  }

  // Mettre à jour le membre
  membre.actif = false;
  membre.dateRetrait = new Date();
  membre.raisonRetrait = raisonRetrait;
  membre.raisonRetraitAutre = raisonRetraitAutre || null;
  membre.reunionRetrait = reunionRetraitId || null;
  await membre.save();

  // Créer l'entrée d'historique
  let typePoste = 'conseil';
  if (membre.estBureau) typePoste = 'bureau';
  if (membre.estCoopte) typePoste = 'coopte';

  await HistoriqueConseil.create({
    membreConseil: membre._id,
    adherent: membre.adherent,
    organisme,
    action: 'retrait',
    typePoste,
    fonction: membre.fonction || null,
    fraction: membre.fraction || null,
    reunion: reunionRetraitId || null,
    raisonRetrait,
    raisonRetraitAutre: raisonRetraitAutre || null,
    modifiePar: req.user._id,
  });

  // Gérer le cas spécial : président SAR retiré
  if (organisme === 'SAR' && membre.fonction === 'president') {
    await gererMembreDeDroitAMAIR(membre.adherent, req.user._id, 'retrait', raisonRetrait, raisonRetraitAutre);
  }

  res.json({ success: true, message: 'Membre retiré avec succès' });
});

// @desc    Modifier un membre du conseil/bureau
// @route   PUT /api/conseil/:organisme/membre/:membreId
// @access  Private/Admin
const modifierMembre = asyncHandler(async (req, res) => {
  const { organisme, membreId } = req.params;
  const { estConseil, estBureau, fraction, fonction, reunionElectionId } = req.body;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const hasPermission = await checkStatutairePermission(req.user, organisme);
  if (!hasPermission) {
    res.status(403);
    throw new Error('Accès refusé');
  }

  const membre = await MembreConseil.findById(membreId);
  if (!membre) {
    res.status(404);
    throw new Error('Membre non trouvé');
  }

  // Sauvegarder les anciennes données pour l'historique
  const anciennesDonnees = {
    estConseil: membre.estConseil,
    estBureau: membre.estBureau,
    fraction: membre.fraction,
    fonction: membre.fonction,
  };

  // Mettre à jour
  if (estConseil !== undefined) membre.estConseil = estConseil;
  if (estBureau !== undefined) membre.estBureau = estBureau;
  if (fraction !== undefined) membre.fraction = fraction;
  if (fonction !== undefined) membre.fonction = fonction;
  if (reunionElectionId) membre.reunionElection = reunionElectionId;

  await membre.save();

  // Créer l'entrée d'historique
  await HistoriqueConseil.create({
    membreConseil: membre._id,
    adherent: membre.adherent,
    organisme,
    action: 'modification',
    anciennesDonnees,
    nouvellesDonnees: {
      estConseil: membre.estConseil,
      estBureau: membre.estBureau,
      fraction: membre.fraction,
      fonction: membre.fonction,
    },
    modifiePar: req.user._id,
  });

  // Gérer le cas président SAR
  const ancienPresident = anciennesDonnees.fonction === 'president';
  const nouveauPresident = membre.fonction === 'president';

  if (organisme === 'SAR') {
    if (!ancienPresident && nouveauPresident) {
      await gererMembreDeDroitAMAIR(membre.adherent, req.user._id, 'ajout');
    } else if (ancienPresident && !nouveauPresident) {
      await gererMembreDeDroitAMAIR(membre.adherent, req.user._id, 'retrait', 'autre', 'Changement de fonction au SAR');
    }
  }

  const membrePopulated = await MembreConseil.findById(membre._id)
    .populate('adherent', 'prenom nom email')
    .populate('reunionElection', 'date type');

  res.json(membrePopulated);
});

// @desc    Récupérer l'historique des modifications
// @route   GET /api/conseil/:organisme/historique
// @access  Private/Admin
const getHistorique = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  const { limit = 50 } = req.query;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const historique = await HistoriqueConseil.find({ organisme })
    .populate('adherent', 'prenom nom')
    .populate('reunion', 'date type')
    .populate('modifiePar', 'prenom nom')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

  res.json(historique);
});

// Fonction helper pour gérer le membre de droit AMAIR (président SAR)
const gererMembreDeDroitAMAIR = async (adherentId, modifieParId, action, raisonRetrait = null, raisonRetraitAutre = null) => {
  if (action === 'ajout') {
    // Vérifier si déjà membre de droit
    const existant = await MembreConseil.findOne({
      adherent: adherentId,
      organisme: 'AMAIR',
      estMembreDeDroit: true,
      actif: true,
    });

    if (!existant) {
      const membre = await MembreConseil.create({
        adherent: adherentId,
        organisme: 'AMAIR',
        estConseil: true,
        estBureau: false,
        estCoopte: false,
        estMembreDeDroit: true,
        actif: true,
      });

      await HistoriqueConseil.create({
        membreConseil: membre._id,
        adherent: adherentId,
        organisme: 'AMAIR',
        action: 'ajout',
        typePoste: 'membre_de_droit',
        modifiePar: modifieParId,
        commentaire: 'Ajout automatique - Président du SAR',
      });
    }
  } else if (action === 'retrait') {
    const membre = await MembreConseil.findOne({
      adherent: adherentId,
      organisme: 'AMAIR',
      estMembreDeDroit: true,
      actif: true,
    });

    if (membre) {
      membre.actif = false;
      membre.dateRetrait = new Date();
      membre.raisonRetrait = raisonRetrait || 'autre';
      membre.raisonRetraitAutre = raisonRetraitAutre || 'Fin de fonction de président du SAR';
      await membre.save();

      await HistoriqueConseil.create({
        membreConseil: membre._id,
        adherent: adherentId,
        organisme: 'AMAIR',
        action: 'retrait',
        typePoste: 'membre_de_droit',
        raisonRetrait: raisonRetrait || 'autre',
        raisonRetraitAutre: raisonRetraitAutre || 'Fin de fonction de président du SAR',
        modifiePar: modifieParId,
        commentaire: 'Retrait automatique - Fin de présidence du SAR',
      });
    }
  }
};

// @desc    Mise à jour en masse du conseil (pour la page dédiée)
// @route   PUT /api/conseil/:organisme/masse
// @access  Private/Admin
const miseAJourMasse = asyncHandler(async (req, res) => {
  const { organisme } = req.params;
  const { ajouts, retraits } = req.body;
  
  if (!['SAR', 'AMAIR'].includes(organisme)) {
    res.status(400);
    throw new Error('Organisme invalide');
  }

  const hasPermission = await checkStatutairePermission(req.user, organisme);
  if (!hasPermission) {
    res.status(403);
    throw new Error('Accès refusé');
  }

  const resultats = {
    ajouts: [],
    retraits: [],
    erreurs: [],
  };

  // Traiter les retraits
  if (retraits && Array.isArray(retraits)) {
    for (const retrait of retraits) {
      try {
        const membre = await MembreConseil.findById(retrait.membreId);
        if (membre && membre.actif) {
          membre.actif = false;
          membre.dateRetrait = new Date();
          membre.raisonRetrait = retrait.raisonRetrait;
          membre.raisonRetraitAutre = retrait.raisonRetraitAutre || null;
          membre.reunionRetrait = retrait.reunionRetraitId || null;
          await membre.save();

          let typePoste = 'conseil';
          if (membre.estBureau) typePoste = 'bureau';
          if (membre.estCoopte) typePoste = 'coopte';

          await HistoriqueConseil.create({
            membreConseil: membre._id,
            adherent: membre.adherent,
            organisme,
            action: 'retrait',
            typePoste,
            raisonRetrait: retrait.raisonRetrait,
            raisonRetraitAutre: retrait.raisonRetraitAutre || null,
            reunion: retrait.reunionRetraitId || null,
            modifiePar: req.user._id,
          });

          // Gérer président SAR
          if (organisme === 'SAR' && membre.fonction === 'president') {
            await gererMembreDeDroitAMAIR(membre.adherent, req.user._id, 'retrait', retrait.raisonRetrait, retrait.raisonRetraitAutre);
          }

          resultats.retraits.push(membre._id);
        }
      } catch (err) {
        resultats.erreurs.push({ type: 'retrait', id: retrait.membreId, erreur: err.message });
      }
    }
  }

  // Traiter les ajouts
  if (ajouts && Array.isArray(ajouts)) {
    for (const ajout of ajouts) {
      try {
        // Vérifier si déjà membre actif
        const dejaActif = await MembreConseil.findOne({
          adherent: ajout.adherentId,
          organisme,
          actif: true,
        });

        if (dejaActif) {
          resultats.erreurs.push({ type: 'ajout', id: ajout.adherentId, erreur: 'Déjà membre actif' });
          continue;
        }

        const nouveauMembre = await MembreConseil.create({
          adherent: ajout.adherentId,
          organisme,
          estConseil: ajout.estConseil || false,
          estBureau: ajout.estBureau || false,
          estCoopte: ajout.estCoopte || false,
          fraction: ajout.fraction || null,
          fonction: ajout.estBureau ? ajout.fonction : null,
          reunionElection: ajout.reunionElectionId || null,
          dateCooptation: ajout.estCoopte ? ajout.dateCooptation : null,
          actif: true,
        });

        let typePoste = 'conseil';
        if (ajout.estBureau) typePoste = 'bureau';
        if (ajout.estCoopte) typePoste = 'coopte';

        await HistoriqueConseil.create({
          membreConseil: nouveauMembre._id,
          adherent: ajout.adherentId,
          organisme,
          action: 'ajout',
          typePoste,
          fonction: ajout.fonction || null,
          fraction: ajout.fraction || null,
          reunion: ajout.reunionElectionId || null,
          dateCooptation: ajout.estCoopte ? ajout.dateCooptation : null,
          modifiePar: req.user._id,
        });

        // Gérer président SAR
        if (organisme === 'SAR' && ajout.fonction === 'president') {
          await gererMembreDeDroitAMAIR(ajout.adherentId, req.user._id, 'ajout');
        }

        resultats.ajouts.push(nouveauMembre._id);
      } catch (err) {
        resultats.erreurs.push({ type: 'ajout', id: ajout.adherentId, erreur: err.message });
      }
    }
  }

  // Générer le PDF de la nouvelle composition
  if (resultats.ajouts.length > 0 || resultats.retraits.length > 0) {
    await generateCompositionPDF(organisme);
  }

  res.json(resultats);
});

// @desc    Générer et stocker le PDF de composition
const generateCompositionPDF = async (organisme) => {
  try {
    // Récupérer la composition actuelle
    const membres = await MembreConseil.find({ organisme, actif: true })
      .populate('adherent', 'prenom nom');

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

    // Séparer par type
    const membresBureau = membres.filter(m => m.estBureau);
    const membresConseil = membres.filter(m => m.estConseil && !m.estBureau);
    const membresCooptes = membres.filter(m => m.estCoopte);
    const membresDeDroit = membres.filter(m => m.estMembreDeDroit);

    // Bureau
    if (membresBureau.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Membres du bureau');
      doc.moveDown(0.5);
      
      const ordreFonctions = ['president', 'vice_president', 'secretaire', 'secretaire_adjoint', 'tresorier', 'tresorier_adjoint'];
      membresBureau.sort((a, b) => ordreFonctions.indexOf(a.fonction) - ordreFonctions.indexOf(b.fonction));
      
      membresBureau.forEach(m => {
        const fonctionLabel = FONCTIONS_BUREAU.find(f => f.value === m.fonction)?.label || m.fonction;
        doc.fontSize(12).font('Helvetica').text(`• ${m.adherent?.prenom} ${m.adherent?.nom} - ${fonctionLabel}`);
      });
      doc.moveDown();
    }

    // Conseil
    if (membresConseil.length > 0) {
      const titreConseil = organisme === 'SAR' ? 'Membres du conseil syndical' : 'Membres du conseil d\'administration';
      doc.fontSize(14).font('Helvetica-Bold').text(titreConseil);
      doc.moveDown(0.5);
      
      membresConseil.sort((a, b) => (a.adherent?.nom || '').localeCompare(b.adherent?.nom || ''));
      
      membresConseil.forEach(m => {
        const fractionLabel = m.fraction ? ` (${FRACTIONS[organisme]?.find(f => f.value === m.fraction)?.label || m.fraction})` : '';
        doc.fontSize(12).font('Helvetica').text(`• ${m.adherent?.prenom} ${m.adherent?.nom}${fractionLabel}`);
      });
      doc.moveDown();
    }

    // Cooptés (AMAIR)
    if (membresCooptes.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Membres cooptés');
      doc.moveDown(0.5);
      
      membresCooptes.forEach(m => {
        const dateCoopt = m.dateCooptation ? ` (coopté le ${new Date(m.dateCooptation).toLocaleDateString('fr-FR')})` : '';
        doc.fontSize(12).font('Helvetica').text(`• ${m.adherent?.prenom} ${m.adherent?.nom}${dateCoopt}`);
      });
      doc.moveDown();
    }

    // Membres de droit
    if (membresDeDroit.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Membres de droit');
      doc.moveDown(0.5);
      
      membresDeDroit.forEach(m => {
        doc.fontSize(12).font('Helvetica').text(`• ${m.adherent?.prenom} ${m.adherent?.nom} (Président du SAR)`);
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
      `conseil/${organisme}`
    );

    console.log(`✅ PDF de composition archivé: ${result.key}`);
    return result.key;
  } catch (error) {
    console.error('Erreur lors de la génération du PDF de composition:', error);
    return null;
  }
};

// @desc    Lister les PDFs de composition archivés
// @route   GET /api/conseil/:organisme/documents
// @access  Private/Admin
const getDocuments = asyncHandler(async (req, res) => {
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
    throw new Error('Non autorisé');
  }

  try {
    const files = await s3Service.listFiles(`conseil/${organisme}/`);

    const documents = files
      .filter(f => f.Key.endsWith('.pdf'))
      .map(f => {
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

    res.json(documents);
  } catch (error) {
    console.error('Erreur lors de la récupération des documents:', error);
    res.status(500);
    throw new Error('Erreur lors de la récupération des documents');
  }
});

// @desc    Télécharger un PDF de composition
// @route   GET /api/conseil/:organisme/documents/download
// @access  Private/Admin
const downloadDocument = asyncHandler(async (req, res) => {
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

  if (!key.startsWith(`conseil/${organisme}/`)) {
    res.status(403);
    throw new Error('Accès non autorisé');
  }

  // Vérifier les permissions
  const permissions = await Permission.findOne({ userId: req.user._id });
  const isSuperAdmin = req.user.role === 'super_admin';
  const hasPermission = permissions?.gestionActivite?.consulterCompositions;
  const managesOrganisme = req.user.organismes?.includes(organisme);

  if (!isSuperAdmin && (!hasPermission || !managesOrganisme)) {
    res.status(403);
    throw new Error('Non autorisé');
  }

  try {
    const signedUrl = await s3Service.getSignedUrl(key, 3600);
    res.json({ url: signedUrl, expiresIn: 3600 });
  } catch (error) {
    console.error('Erreur lors de la génération du lien:', error);
    res.status(500);
    throw new Error('Erreur lors de la génération du lien');
  }
});

module.exports = {
  generateCompositionPDF,
  getDocuments,
  downloadDocument,
  getComposition,
  getReunionsDisponibles,
  getEligibles,
  ajouterMembre,
  retirerMembre,
  modifierMembre,
  getHistorique,
  miseAJourMasse,
  FONCTIONS_BUREAU,
  FRACTIONS,
};
