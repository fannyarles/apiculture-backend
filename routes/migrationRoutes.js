const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const asyncHandler = require('express-async-handler');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const Adhesion = require('../models/adhesionModel');
const crypto = require('crypto');
const sendEmail = require('../services/emailService');

// Configuration multer pour stocker en mémoire
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté. Utilisez un fichier Excel (.xlsx ou .xls)'), false);
    }
  }
});

// @desc    Prévisualiser les données d'un fichier Excel pour import d'adhésions
// @route   POST /api/migration/preview-adhesions
// @access  Private/SuperAdmin
router.post('/preview-adhesions', protect, superAdmin, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Aucun fichier fourni');
  }

  try {
    // Lire le fichier Excel
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir en JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rawData.length < 2) {
      res.status(400);
      throw new Error('Le fichier est vide ou ne contient pas de données');
    }

    // Première ligne = en-têtes
    const headers = rawData[0].map(h => String(h).trim().toLowerCase());
    
    // Mapping des colonnes attendues vers les champs de l'adhésion
    // L'utilisateur devra adapter selon son fichier
    const columnMapping = {
      // Informations personnelles
      'email': 'email',
      'mail': 'email',
      'nom': 'nom',
      'prenom': 'prenom',
      'prénom': 'prenom',
      'civilite': 'designation',
      'civilité': 'designation',
      'designation': 'designation',
      'type': 'typePersonne',
      'type personne': 'typePersonne',
      'typepersonne': 'typePersonne',
      'raison sociale': 'raisonSociale',
      'raisonsociale': 'raisonSociale',
      'societe': 'raisonSociale',
      'société': 'raisonSociale',
      'telephone': 'telephone',
      'téléphone': 'telephone',
      'tel': 'telephone',
      'mobile': 'telephoneMobile',
      'telephone mobile': 'telephoneMobile',
      'téléphone mobile': 'telephoneMobile',
      'adresse': 'adresseRue',
      'rue': 'adresseRue',
      'code postal': 'codePostal',
      'codepostal': 'codePostal',
      'cp': 'codePostal',
      'ville': 'ville',
      'complement': 'adresseComplement',
      'complément': 'adresseComplement',
      'complement adresse': 'adresseComplement',
      'complément adresse': 'adresseComplement',
      'date naissance': 'dateNaissance',
      'datenaissance': 'dateNaissance',
      // Informations apicoles
      'napi': 'napi',
      'numéro napi': 'napi',
      'numero napi': 'napi',
      'amexa': 'numeroAmexa',
      'numero amexa': 'numeroAmexa',
      'numéro amexa': 'numeroAmexa',
      'ruches': 'nombreRuches',
      'nombre ruches': 'nombreRuches',
      'nb ruches': 'nombreRuches',
      'ruchers': 'nombreRuchers',
      'nombre ruchers': 'nombreRuchers',
      'emplacements': 'nombreRuchers',
      'nb emplacements': 'nombreRuchers',
      'departement': 'departement',
      'département': 'departement',
      'commune': 'commune',
      'siret': 'siret',
      // Adhésion
      'organisme': 'organisme',
      'annee': 'annee',
      'année': 'annee',
      'montant': 'montant',
      'type paiement': 'typePaiement',
      'typepaiement': 'typePaiement',
      'paiement': 'typePaiement',
      'status': 'status',
      'statut': 'status',
      'nouveau': 'estNouveau',
      'est nouveau': 'estNouveau',
      'nouvel adhérent': 'estNouveau',
      'notes': 'notes',
      'note': 'notes',
    };

    // Mapper les colonnes trouvées
    const mappedColumns = {};
    headers.forEach((header, index) => {
      const normalizedHeader = header.toLowerCase().trim();
      if (columnMapping[normalizedHeader]) {
        mappedColumns[columnMapping[normalizedHeader]] = index;
      }
    });

    // Parser les lignes de données
    const rows = [];
    const errors = [];
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0 || row.every(cell => !cell)) continue; // Ignorer les lignes vides
      
      const getValue = (field) => {
        const idx = mappedColumns[field];
        if (idx === undefined) return null;
        const val = row[idx];
        return val !== undefined && val !== '' ? String(val).trim() : null;
      };

      const getNumericValue = (field) => {
        const val = getValue(field);
        if (!val) return null;
        const num = parseInt(val, 10);
        return isNaN(num) ? null : num;
      };

      // Construire l'objet adhésion
      const adhesionData = {
        rowNumber: i + 1,
        // Infos personnelles
        email: getValue('email'),
        nom: getValue('nom'),
        prenom: getValue('prenom'),
        designation: getValue('designation'),
        typePersonne: getValue('typePersonne'),
        raisonSociale: getValue('raisonSociale'),
        telephone: getValue('telephone'),
        telephoneMobile: getValue('telephoneMobile'),
        adresseRue: getValue('adresseRue'),
        adresseComplement: getValue('adresseComplement'),
        codePostal: getValue('codePostal'),
        ville: getValue('ville'),
        dateNaissance: getValue('dateNaissance'),
        // Infos apicoles
        napi: getValue('napi'),
        numeroAmexa: getValue('numeroAmexa'),
        nombreRuches: getNumericValue('nombreRuches'),
        nombreRuchers: getNumericValue('nombreRuchers'),
        departement: getValue('departement'),
        commune: getValue('commune'),
        siret: getValue('siret'),
        // Adhésion
        organisme: getValue('organisme')?.toUpperCase(),
        annee: getNumericValue('annee'),
        montant: getNumericValue('montant'),
        typePaiement: getValue('typePaiement'),
        status: getValue('status'),
        estNouveau: getValue('estNouveau'),
        notes: getValue('notes'),
      };

      // Validation basique
      const rowErrors = [];
      if (!adhesionData.email) rowErrors.push('Email manquant');
      if (!adhesionData.nom) rowErrors.push('Nom manquant');
      if (!adhesionData.organisme || !['SAR', 'AMAIR'].includes(adhesionData.organisme)) {
        rowErrors.push('Organisme invalide (SAR ou AMAIR requis)');
      }
      if (!adhesionData.annee) rowErrors.push('Année manquante');

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, errors: rowErrors, data: adhesionData });
      }

      rows.push(adhesionData);
    }

    res.json({
      success: true,
      totalRows: rows.length,
      headers: headers,
      mappedColumns: Object.keys(mappedColumns),
      unmappedColumns: headers.filter(h => !columnMapping[h.toLowerCase().trim()]),
      preview: rows.slice(0, 10), // Aperçu des 10 premières lignes
      allRows: rows,
      errors: errors,
      validRows: rows.length - errors.length
    });

  } catch (error) {
    console.error('Erreur parsing Excel:', error);
    res.status(500);
    throw new Error('Erreur lors de la lecture du fichier Excel: ' + error.message);
  }
}));

// @desc    Importer les adhésions depuis les données prévisualisées
// @route   POST /api/migration/import-adhesions
// @access  Private/SuperAdmin
router.post('/import-adhesions', protect, superAdmin, asyncHandler(async (req, res) => {
  const { rows, options = {} } = req.body;

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    res.status(400);
    throw new Error('Aucune donnée à importer');
  }

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    details: []
  };

  const skipExisting = options.skipExisting !== false;
  const createUsers = options.createUsers !== false;
  const sendWelcomeEmail = options.sendWelcomeEmail !== false;

  for (const rowData of rows) {
    try {
      // Vérifier si l'email existe
      let user = await User.findOne({ email: rowData.email.toLowerCase() });
      let userCreated = false;
      
      if (!user && createUsers) {
        // Générer un mot de passe aléatoire (ne sera pas communiqué)
        const randomPassword = crypto.randomBytes(16).toString('hex');
        
        // Générer un token d'invitation pour définir le mot de passe
        const inviteToken = crypto.randomBytes(32).toString('hex');
        // Hasher le token pour le stockage (comme dans forgotPassword)
        const hashedToken = crypto.createHash('sha256').update(inviteToken).digest('hex');
        const inviteTokenExpire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
        
        // Créer l'utilisateur
        user = await User.create({
          email: rowData.email.toLowerCase(),
          nom: rowData.nom || 'Non renseigné',
          prenom: rowData.prenom || 'Non renseigné',
          designation: rowData.designation || null,
          typePersonne: rowData.typePersonne || null,
          raisonSociale: rowData.raisonSociale || null,
          password: randomPassword,
          telephone: rowData.telephone || null,
          telephoneMobile: rowData.telephoneMobile || null,
          dateNaissance: rowData.dateNaissance ? new Date(rowData.dateNaissance) : null,
          adresse: {
            rue: rowData.adresseRue || null,
            complement: rowData.adresseComplement || null,
            codePostal: rowData.codePostal || null,
            ville: rowData.ville || null,
          },
          role: 'user',
          roles: ['user'],
          resetPasswordToken: hashedToken,
          resetPasswordExpire: inviteTokenExpire,
        });
        
        userCreated = true;
        
        // Envoyer l'email d'invitation pour définir son mot de passe
        if (sendWelcomeEmail) {
          const inviteUrl = `${process.env.FRONTEND_URL}/reset-password/${inviteToken}`;
          
          try {
            await sendEmail({
              to: user.email,
              subject: 'Invitation - Créez votre compte sur la plateforme du Syndicat Apicole de La Réunion',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #D97706;">Bienvenue ${user.prenom} ${user.nom} !</h2>
                  <p>Votre compte a été créé sur la plateforme du <strong>Syndicat Apicole de La Réunion (SAR)</strong>.</p>
                  <p>Pour activer votre compte et définir votre mot de passe, cliquez sur le bouton ci-dessous :</p>
                  <p style="margin-top: 20px; text-align: center;">
                    <a href="${inviteUrl}" style="background-color: #D97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                      Créer mon mot de passe
                    </a>
                  </p>
                  <p style="margin-top: 20px; color: #666; font-size: 13px;">
                    Votre email de connexion : <strong>${user.email}</strong>
                  </p>
                  <p style="color: #999; font-size: 12px;">
                    Ce lien est valable 7 jours. Si vous n'avez pas demandé ce compte, ignorez cet email.
                  </p>
                  <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                  <p style="color: #666; font-size: 12px;">
                    Syndicat Apicole de La Réunion - SAR
                  </p>
                </div>
              `,
            });
            results.details.push({
              row: rowData.rowNumber,
              action: 'user_created',
              email: user.email,
              emailSent: true
            });
          } catch (emailError) {
            console.error(`Erreur envoi email pour ${user.email}:`, emailError);
            results.details.push({
              row: rowData.rowNumber,
              action: 'user_created',
              email: user.email,
              emailSent: false,
              emailError: emailError.message
            });
          }
        } else {
          results.details.push({
            row: rowData.rowNumber,
            action: 'user_created',
            email: user.email,
            tempPassword: tempPassword // Retourner le mdp si pas d'email envoyé
          });
        }
      } else if (!user) {
        results.errors.push({
          row: rowData.rowNumber,
          error: `Utilisateur ${rowData.email} non trouvé et création désactivée`
        });
        results.skipped++;
        continue;
      }

      // Vérifier si l'adhésion existe déjà
      const existingAdhesion = await Adhesion.findOne({
        user: user._id,
        organisme: rowData.organisme,
        annee: rowData.annee
      });

      if (existingAdhesion && skipExisting) {
        results.details.push({
          row: rowData.rowNumber,
          action: 'skipped',
          reason: 'Adhésion existante',
          email: rowData.email,
          organisme: rowData.organisme,
          annee: rowData.annee
        });
        results.skipped++;
        continue;
      }

      // Normaliser le type de paiement
      let typePaiement = 'cheque';
      if (rowData.typePaiement) {
        const tp = rowData.typePaiement.toLowerCase();
        if (tp.includes('esp') || tp === 'espece' || tp === 'espèce') typePaiement = 'espece';
        else if (tp.includes('ligne') || tp === 'en_ligne' || tp === 'carte') typePaiement = 'en_ligne';
        else if (tp === 'gratuit' || tp === 'offert') typePaiement = 'gratuit';
      }

      // Normaliser le statut
      const currentYear = new Date().getFullYear();
      let status = 'actif';
      
      // Si l'année est antérieure à l'année actuelle, le statut est "expiree"
      if (rowData.annee < currentYear) {
        status = 'expiree';
      } else if (rowData.status) {
        const st = rowData.status.toLowerCase();
        if (st === 'en_attente' || st.includes('attente')) status = 'en_attente';
        else if (st === 'refuse' || st === 'refusé') status = 'refuse';
        else if (st === 'expiree' || st === 'expirée') status = 'expiree';
      }

      // Créer ou mettre à jour l'adhésion
      const adhesionData = {
        user: user._id,
        organisme: rowData.organisme,
        annee: rowData.annee,
        napi: rowData.napi || null,
        numeroAmexa: rowData.numeroAmexa || null,
        nombreRuches: rowData.nombreRuches || 0,
        nombreRuchers: rowData.nombreRuchers || 0,
        localisation: {
          departement: rowData.departement || null,
          commune: rowData.commune || null,
        },
        siret: rowData.siret || null,
        paiement: {
          montant: rowData.montant || 0,
          typePaiement: typePaiement,
          status: 'paye',
          datePaiement: new Date(),
        },
        status: status,
        estNouveau: rowData.estNouveau === 'oui' || rowData.estNouveau === 'true' || rowData.estNouveau === true,
        notes: rowData.notes || 'Import migration',
        dateValidation: new Date(),
        informationsPersonnelles: {
          typePersonne: rowData.typePersonne || user.typePersonne || null,
          designation: rowData.designation || null,
          raisonSociale: rowData.raisonSociale || user.raisonSociale || null,
          nom: rowData.nom || user.nom,
          prenom: rowData.prenom || user.prenom,
          dateNaissance: rowData.dateNaissance ? new Date(rowData.dateNaissance) : user.dateNaissance,
          adresse: {
            rue: rowData.adresseRue || user.adresse?.rue || null,
            complement: rowData.adresseComplement || user.adresse?.complement || null,
            codePostal: rowData.codePostal || user.adresse?.codePostal || null,
            ville: rowData.ville || user.adresse?.ville || null,
          },
          telephone: rowData.telephone || user.telephone || null,
          telephoneMobile: rowData.telephoneMobile || user.telephoneMobile || null,
          email: rowData.email,
        },
      };

      if (existingAdhesion) {
        // Mise à jour
        Object.assign(existingAdhesion, adhesionData);
        await existingAdhesion.save();
        results.updated++;
        results.details.push({
          row: rowData.rowNumber,
          action: 'updated',
          email: rowData.email,
          organisme: rowData.organisme,
          annee: rowData.annee
        });
      } else {
        // Création
        await Adhesion.create(adhesionData);
        results.created++;
        results.details.push({
          row: rowData.rowNumber,
          action: 'created',
          email: rowData.email,
          organisme: rowData.organisme,
          annee: rowData.annee
        });
      }

    } catch (error) {
      console.error(`Erreur import ligne ${rowData.rowNumber}:`, error);
      results.errors.push({
        row: rowData.rowNumber,
        email: rowData.email,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    message: `Import terminé: ${results.created} créées, ${results.updated} mises à jour, ${results.skipped} ignorées, ${results.errors.length} erreurs`,
    results
  });
}));

module.exports = router;
