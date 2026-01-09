const Service = require('../models/serviceModel');
const UNAFExport = require('../models/unafExportModel');
const { uploadFile, getSignedUrl } = require('./s3Service');
const { generateExcelFromTemplate, updateCells, batchUpdateCells } = require('./googleSheetsService');

// ID du template Google Sheets (depuis .env)
const GOOGLE_SHEETS_TEMPLATE_ID = process.env.GOOGLE_SHEETS_TEMPLATE_ID;

// Dates d'export pour 2026
const EXPORT_DATES_2026 = [
  new Date('2026-01-12'),
  new Date('2026-01-19'),
  new Date('2026-01-26'),
  new Date('2026-02-02'),
  new Date('2026-02-09'),
  new Date('2026-02-16'),
  new Date('2026-03-02'),
  new Date('2026-03-16'),
  new Date('2026-03-30'),
  new Date('2026-04-27'),
  new Date('2026-05-25'),
  new Date('2026-06-22'),
  new Date('2026-07-20'),
  new Date('2026-08-17'),
  new Date('2026-09-14'),
];


/**
 * Vérifie si une date est une date d'export
 * @param {Date} date 
 * @param {number} annee
 * @returns {boolean}
 */
const isExportDate = (date, annee = 2026) => {
  const dates = annee === 2026 ? EXPORT_DATES_2026 : [];
  return dates.some(d => 
    d.getDate() === date.getDate() && 
    d.getMonth() === date.getMonth() && 
    d.getFullYear() === date.getFullYear()
  );
};

/**
 * Récupère la date d'export précédente
 * @param {Date} currentDate 
 * @param {number} annee
 * @returns {Date|null}
 */
const getPreviousExportDate = (currentDate, annee = 2026) => {
  const dates = annee === 2026 ? EXPORT_DATES_2026 : [];
  const sortedDates = [...dates].sort((a, b) => a - b);
  
  for (let i = sortedDates.length - 1; i >= 0; i--) {
    if (sortedDates[i] < currentDate) {
      return sortedDates[i];
    }
  }
  return null;
};

/**
 * Vérifie si c'est le premier export de l'année
 * @param {Date} date 
 * @param {number} annee
 * @returns {boolean}
 */
const isFirstExportOfYear = (date, annee = 2026) => {
  const dates = annee === 2026 ? EXPORT_DATES_2026 : [];
  const sortedDates = [...dates].sort((a, b) => a - b);
  
  if (sortedDates.length === 0) return false;
  
  return sortedDates[0].getDate() === date.getDate() && 
         sortedDates[0].getMonth() === date.getMonth() && 
         sortedDates[0].getFullYear() === date.getFullYear();
};

/**
 * Récupère les paiements UNAF non exportés
 * @param {number} annee 
 * @returns {Promise<Array>}
 */
const getUnexportedPayments = async (annee) => {
  // Récupérer les services UNAF avec paiement effectué mais non exporté
  const services = await Service.find({
    typeService: 'assurance_unaf',
    annee: annee,
    'paiement.status': 'paye',
    'paiement.exportedToUNAF': { $ne: true },
  }).populate('user', 'nom prenom email').populate('adhesion');

  const payments = [];

  // Ajouter les paiements initiaux non exportés
  for (const service of services) {
    payments.push({
      type: 'initial',
      serviceId: service._id,
      service: service,
      user: service.user,
      montant: service.paiement.montant,
      datePaiement: service.paiement.datePaiement,
      options: service.unafData?.options,
      informations: service.informationsPersonnelles,
      unafData: service.unafData,
    });
  }

  // Récupérer les modifications non exportées
  const servicesWithModifications = await Service.find({
    typeService: 'assurance_unaf',
    annee: annee,
    'historiqueModifications': {
      $elemMatch: {
        'paiement.status': 'paye',
        'exportedToUNAF': { $ne: true },
      },
    },
  }).populate('user', 'nom prenom email').populate('adhesion');

  for (const service of servicesWithModifications) {
    service.historiqueModifications.forEach((modif, index) => {
      if (modif.paiement?.status === 'paye' && !modif.exportedToUNAF) {
        // Pour les modifications, ne construire que les options MODIFIÉES
        const currentOptions = service.unafData?.options || {};
        const mods = modif.modifications || {};
        
        // Construire uniquement les options qui ont changé
        const optionsModifiees = {};
        
        // Revue : seulement si ajoutée (passage de 'aucun' à une option)
        if (mods.revueApres && mods.revueApres !== mods.revueAvant && mods.revueApres !== 'aucun') {
          optionsModifiees.revue = {
            choix: mods.revueApres,
          };
        }
        
        // Assurance : seulement si upgrade de formule
        if (mods.formuleApres && mods.formuleApres !== mods.formuleAvant) {
          optionsModifiees.assurance = {
            formule: mods.formuleApres,
          };
        }
        
        // Affaires juridiques : seulement si ajoutée
        if (mods.affairesJuridiquesApres === true && mods.affairesJuridiquesAvant === false) {
          optionsModifiees.affairesJuridiques = {
            souscrit: true,
          };
        }
        
        // Écocontribution : seulement si ajoutée
        if (mods.ecocontributionApres === true && mods.ecocontributionAvant === false) {
          optionsModifiees.ecocontribution = {
            souscrit: true,
          };
        }
        
        // SIRET : uniquement si écocontribution est ajoutée dans cette modification
        const unafDataForExport = {
          ...service.unafData,
          siret: (mods.ecocontributionApres === true && mods.ecocontributionAvant === false && (mods.siret || service.unafData?.siret))
            ? mods.siret || service.unafData?.siret 
            : '',
          napi: mods.napi || service.unafData?.napi || '',
        };
        
        payments.push({
          type: 'modification',
          serviceId: service._id,
          modificationIndex: index,
          service: service,
          user: service.user,
          montant: modif.montantSupplementaire,
          datePaiement: modif.paiement.datePaiement,
          modifications: modif.modifications,
          // Utiliser uniquement les options modifiées pour l'export
          options: optionsModifiees,
          informations: service.informationsPersonnelles,
          unafData: unafDataForExport,
        });
      }
    });
  }

  return payments;
};

/**
 * Génère le nom de fichier selon la nomenclature UNAF
 * @param {number} annee 
 * @param {Date} exportDate 
 * @param {boolean} isComplement 
 * @returns {string}
 */
const generateFileName = (annee, exportDate, isComplement = false) => {
  const day = String(exportDate.getDate()).padStart(2, '0');
  const month = String(exportDate.getMonth() + 1).padStart(2, '0');
  const year = String(exportDate.getFullYear()).slice(-2);
  const dateStr = `${day}${month}${year}`;
  
  const baseName = `SAR_Listingstructure${annee}_export_${dateStr}`;
  return isComplement ? `${baseName}_complement.xlsx` : `${baseName}.xlsx`;
};

/**
 * Prépare une ligne de données pour l'export Excel
 * @param {Object} payment 
 * @returns {Array}
 */
const prepareRowData = (payment) => {
  const info = payment.informations || {};
  const unafData = payment.unafData || {};
  const options = payment.options || {};
  const adresse = info.adresse || {};

  // SIRET : uniquement si ecocontribution est souscrit
  const siretToExport = options.ecocontribution?.souscrit ? (unafData.siret || '') : '';

  return [
    info.nom || payment.user?.nom || '',           // A: Nom
    info.prenom || payment.user?.prenom || '',     // B: Prénom
    (adresse.rue || '').trim(),                    // C: Rue
    '',                                             // D: (vide ou autre)
    (adresse.complement || '').trim(),             // E: Complément
    (adresse.codePostal || '').trim(),             // F: Code postal
    (adresse.ville || '').trim(),                  // G: Ville
    (adresse.pays || 'France').trim(),             // H: Pays
    info.email || payment.user?.email || '',       // I: Email
    info.telephone || '',                          // J: Téléphone
    info.telephoneMobile || '',                    // K: Téléphone mobile
    siretToExport,                                 // L: SIRET (uniquement si ecocontribution souscrit)
    unafData.nombreRuches || '',                   // M: Nb ruches
    payment.type === 'initial' ? 1 : 0,            // N: Cotisation individuelle (1 si initial, 0 si modification)
    options.revue?.choix === 'papier' ? 1 : '',              // O: Revue papier
    options.revue?.choix === 'numerique' ? 1 : '',           // P: Revue numérique
    options.revue?.choix === 'papier_numerique' ? 1 : '',    // Q: Revue papier & numérique
    options.assurance?.formule === 'formule1' ? 1 : '',      // R: Formule 1
    options.assurance?.formule === 'formule2' ? 1 : '',      // S: Formule 2
    options.assurance?.formule === 'formule3' ? 1 : '',      // T: Formule 3
    options.affairesJuridiques?.souscrit ? 1 : '',           // U: Affaires juridiques
  ];
};

/**
 * Génère un fichier Excel pour un ensemble de paiements
 * @param {Array} payments - Liste des paiements à inclure
 * @param {number} annee 
 * @param {Date} exportDate 
 * @param {boolean} isComplement - True si c'est le fichier des modifications
 * @returns {Promise<Object>}
 */
const generateSingleExcelFile = async (payments, annee, exportDate, isComplement = false) => {
  if (!GOOGLE_SHEETS_TEMPLATE_ID) {
    throw new Error('GOOGLE_SHEETS_TEMPLATE_ID n\'est pas configuré dans le .env');
  }

  if (payments.length === 0) {
    return null;
  }

  const isFirst = !isComplement && isFirstExportOfYear(exportDate, annee);
  const rowsData = payments.map(prepareRowData);
  const montantTotal = payments.reduce((sum, p) => sum + (p.montant || 0), 0);

  // Générer l'Excel via Google Sheets
  const exportName = `UNAF_Export_${annee}_${isComplement ? 'complement' : 'principal'}_${Date.now()}`;
  
  const buffer = await generateExcelFromTemplate(
    GOOGLE_SHEETS_TEMPLATE_ID,
    exportName,
    async (spreadsheetId, sheetName) => {
      // 1. Remplir les informations générales (AA5, AA6, AA8)
      const generalUpdates = [
        { range: `${sheetName}!AA5`, value: exportDate.toLocaleDateString('fr-FR') },
        { range: `${sheetName}!AA6`, value: 'Virement' },
        { range: `${sheetName}!AA8`, value: isFirst ? 1 : 0 },
      ];
      await batchUpdateCells(spreadsheetId, generalUpdates);

      // 2. Remplir les données des paiements (à partir de la ligne 3)
      if (rowsData.length > 0) {
        const dataRange = `${sheetName}!A3:U${3 + rowsData.length - 1}`;
        await updateCells(spreadsheetId, dataRange, rowsData);
      }
    }
  );

  // Générer le nom de fichier selon la nomenclature
  const folder = 'unaf-exports';
  const fileName = generateFileName(annee, exportDate, isComplement);
  
  // Upload vers S3
  const s3Key = `${fileName}`;
  const uploadResult = await uploadFile(
    buffer,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    folder
  );

  return {
    buffer,
    fileName,
    s3Key: uploadResult.key,
    s3Url: uploadResult.url,
    nombrePaiements: payments.length,
    montantTotal,
  };
};

/**
 * Génère les fichiers Excel pour l'export UNAF (2 fichiers séparés)
 * @param {number} annee 
 * @param {Date} exportDate 
 * @returns {Promise<Object>}
 */
const generateUNAFExcel = async (annee, exportDate = new Date()) => {
  // Vérifier que le template ID est configuré
  if (!GOOGLE_SHEETS_TEMPLATE_ID) {
    throw new Error('GOOGLE_SHEETS_TEMPLATE_ID n\'est pas configuré dans le .env');
  }

  // Récupérer les paiements non exportés
  const allPayments = await getUnexportedPayments(annee);

  if (allPayments.length === 0) {
    return { success: false, message: 'Aucun nouveau paiement à exporter' };
  }

  // Séparer les paiements initiaux et les modifications
  const initialPayments = allPayments.filter(p => p.type === 'initial');
  const modificationPayments = allPayments.filter(p => p.type === 'modification');

  // Variables pour tracker les éléments inclus
  const servicesInclus = initialPayments.map(p => p.serviceId);
  const modificationsIncluses = modificationPayments.map(p => ({
    serviceId: p.serviceId,
    modificationIndex: p.modificationIndex,
  }));

  const isFirst = isFirstExportOfYear(exportDate, annee);
  let fichierPrincipal = null;
  let fichierComplement = null;

  // Générer le fichier principal (nouvelles souscriptions)
  if (initialPayments.length > 0) {
    fichierPrincipal = await generateSingleExcelFile(initialPayments, annee, exportDate, false);
    console.log(`✅ Fichier principal généré: ${fichierPrincipal.fileName} (${initialPayments.length} souscriptions)`);
  }

  // Générer le fichier complément (modifications)
  if (modificationPayments.length > 0) {
    fichierComplement = await generateSingleExcelFile(modificationPayments, annee, exportDate, true);
    console.log(`✅ Fichier complément généré: ${fichierComplement.fileName} (${modificationPayments.length} modifications)`);
  }

  // Marquer les paiements comme exportés
  const exportDateNow = new Date();
  
  // Marquer les services initiaux
  for (const serviceId of servicesInclus) {
    await Service.findByIdAndUpdate(serviceId, {
      'paiement.exportedToUNAF': true,
      'paiement.exportDate': exportDateNow,
    });
  }

  // Marquer les modifications
  for (const modif of modificationsIncluses) {
    await Service.findByIdAndUpdate(modif.serviceId, {
      [`historiqueModifications.${modif.modificationIndex}.exportedToUNAF`]: true,
      [`historiqueModifications.${modif.modificationIndex}.exportDate`]: exportDateNow,
    });
  }

  // Calculer les totaux
  const nombrePaiementsTotal = allPayments.length;
  const montantTotal = allPayments.reduce((sum, p) => sum + (p.montant || 0), 0);

  // Créer l'enregistrement d'export
  const exportRecord = await UNAFExport.create({
    dateExport: exportDate,
    annee: annee,
    isFirstExport: isFirst,
    fichierPrincipal: fichierPrincipal ? {
      s3Url: fichierPrincipal.s3Url,
      s3Key: fichierPrincipal.s3Key,
      fileName: fichierPrincipal.fileName,
      nombrePaiements: fichierPrincipal.nombrePaiements,
      montantTotal: fichierPrincipal.montantTotal,
    } : undefined,
    fichierComplement: fichierComplement ? {
      s3Url: fichierComplement.s3Url,
      s3Key: fichierComplement.s3Key,
      fileName: fichierComplement.fileName,
      nombrePaiements: fichierComplement.nombrePaiements,
      montantTotal: fichierComplement.montantTotal,
    } : undefined,
    // Compatibilité avec l'ancien format (utiliser le fichier principal par défaut)
    s3Url: fichierPrincipal?.s3Url || fichierComplement?.s3Url,
    s3Key: fichierPrincipal?.s3Key || fichierComplement?.s3Key,
    nombrePaiements: nombrePaiementsTotal,
    montantTotal: montantTotal,
    servicesInclus: servicesInclus,
    modificationsIncluses: modificationsIncluses,
    status: 'genere',
  });

  return {
    success: true,
    export: exportRecord,
    nombrePaiements: nombrePaiementsTotal,
    montantTotal: montantTotal,
    fichierPrincipal: fichierPrincipal,
    fichierComplement: fichierComplement,
    // Pour l'envoi d'email
    fichiers: [fichierPrincipal, fichierComplement].filter(Boolean),
  };
};

/**
 * Récupère tous les exports UNAF pour une année
 * @param {number} annee 
 * @returns {Promise<Array>}
 */
const getExportsByYear = async (annee) => {
  const exports = await UNAFExport.find({ annee }).sort({ dateExport: -1 });
  
  // Régénérer les URLs signées pour les deux fichiers
  for (const exp of exports) {
    // Nouveau format avec deux fichiers
    if (exp.fichierPrincipal?.s3Key) {
      try {
        exp.fichierPrincipal.s3Url = await getSignedUrl(exp.fichierPrincipal.s3Key, 3600);
      } catch (error) {
        console.error('Erreur régénération URL fichier principal:', error);
      }
    }
    if (exp.fichierComplement?.s3Key) {
      try {
        exp.fichierComplement.s3Url = await getSignedUrl(exp.fichierComplement.s3Key, 3600);
      } catch (error) {
        console.error('Erreur régénération URL fichier complément:', error);
      }
    }
    // Ancien format (compatibilité)
    if (exp.s3Key && !exp.fichierPrincipal?.s3Key) {
      try {
        exp.s3Url = await getSignedUrl(exp.s3Key, 3600);
      } catch (error) {
        console.error('Erreur régénération URL:', error);
      }
    }
  }
  
  return exports;
};

/**
 * Récupère les statistiques UNAF pour une année
 * @param {number} annee 
 * @returns {Promise<Object>}
 */
const getUNAFStats = async (annee) => {
  const totalServices = await Service.countDocuments({
    typeService: 'assurance_unaf',
    annee: annee,
    'paiement.status': 'paye',
  });

  const exportedServices = await Service.countDocuments({
    typeService: 'assurance_unaf',
    annee: annee,
    'paiement.status': 'paye',
    'paiement.exportedToUNAF': true,
  });

  const pendingServices = totalServices - exportedServices;

  // Compter les modifications
  const servicesWithModifications = await Service.find({
    typeService: 'assurance_unaf',
    annee: annee,
    'historiqueModifications.paiement.status': 'paye',
  });

  let totalModifications = 0;
  let exportedModifications = 0;

  for (const service of servicesWithModifications) {
    for (const modif of service.historiqueModifications) {
      if (modif.paiement?.status === 'paye') {
        totalModifications++;
        if (modif.exportedToUNAF) {
          exportedModifications++;
        }
      }
    }
  }

  const pendingModifications = totalModifications - exportedModifications;

  // Exports effectués
  const exports = await UNAFExport.find({ annee }).sort({ dateExport: -1 });

  // Prochaine date d'export
  const today = new Date();
  const dates = annee === 2026 ? EXPORT_DATES_2026 : [];
  const nextExportDate = dates.find(d => d > today) || null;

  return {
    totalServices,
    exportedServices,
    pendingServices,
    totalModifications,
    exportedModifications,
    pendingModifications,
    totalPending: pendingServices + pendingModifications,
    exports,
    nextExportDate,
    exportDates: dates,
  };
};

module.exports = {
  EXPORT_DATES_2026,
  isExportDate,
  getPreviousExportDate,
  isFirstExportOfYear,
  getUnexportedPayments,
  generateUNAFExcel,
  getExportsByYear,
  getUNAFStats,
};
