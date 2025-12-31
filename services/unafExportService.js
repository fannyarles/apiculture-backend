const ExcelJS = require('exceljs');
const path = require('path');
const Service = require('../models/serviceModel');
const UNAFExport = require('../models/unafExportModel');
const { uploadFile, getSignedUrl } = require('./s3Service');

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

// Chemin vers le template Excel
const TEMPLATE_PATH = path.join(__dirname, '../uploads/unaf/SAR_Listingstructure2026miseajour.xlsx');

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
        payments.push({
          type: 'modification',
          serviceId: service._id,
          modificationIndex: index,
          service: service,
          user: service.user,
          montant: modif.montantSupplementaire,
          datePaiement: modif.paiement.datePaiement,
          modifications: modif.modifications,
          // Utiliser les options actuelles du service après modification
          options: service.unafData?.options,
          informations: service.informationsPersonnelles,
        });
      }
    });
  }

  return payments;
};

/**
 * Génère le fichier Excel pour l'export UNAF
 * @param {number} annee 
 * @param {Date} exportDate 
 * @returns {Promise<Object>}
 */
const generateUNAFExcel = async (annee, exportDate = new Date()) => {
  // Récupérer les paiements non exportés
  const payments = await getUnexportedPayments(annee);

  if (payments.length === 0) {
    return { success: false, message: 'Aucun nouveau paiement à exporter' };
  }

  // Charger le template Excel
  const workbook = new ExcelJS.Workbook();
  
  try {
    await workbook.xlsx.readFile(TEMPLATE_PATH);
  } catch (fileError) {
    console.error('Erreur lecture template Excel:', fileError);
    throw new Error(`Impossible de lire le template Excel: ${fileError.message}`);
  }

  // Forcer Excel à recalculer toutes les formules à l'ouverture du fichier
  workbook.calcProperties = workbook.calcProperties || {};
  workbook.calcProperties.fullCalcOnLoad = true;
  
  // Récupérer la première feuille (par index ou par nom)
  let worksheet = workbook.getWorksheet(1);

  if (!worksheet) {
    // Essayer de récupérer par nom ou la première feuille disponible
    worksheet = workbook.worksheets[0];
  }
  
  if (!worksheet) {
    throw new Error('Aucune feuille trouvée dans le template Excel');
  }

  // Remplir les informations générales
  // Case AA5 : date du jour de l'export
  worksheet.getCell('AA5').value = exportDate.toLocaleDateString('fr-FR');
  
  // Case AA6 : "Virement"
  worksheet.getCell('AA6').value = 'Virement';
  
  // Case AA8 : 1 si premier export, sinon 0
  const isFirst = isFirstExportOfYear(exportDate, annee);
  worksheet.getCell('AA8').value = isFirst ? 1 : 0;

  // Compteurs pour les quantités (AA15-AA24)
  const counts = {
    cotisationIndividuelle: 0,  // AA15 - colonne N
    revuePapier: 0,             // AA16 - colonne O
    revueNumerique: 0,          // AA17 - colonne P
    revuePapierNumerique: 0,    // AA18 - colonne Q
    formule1: 0,                // AA19 - colonne R
    formule2: 0,                // AA20 - colonne S
    formule3: 0,                // AA21 - colonne T
    affairesJuridiques: 0,      // AA22 - colonne U
  };

  // Ajouter les données à partir de la ligne 3
  let currentRow = 3;
  const servicesInclus = [];
  const modificationsIncluses = [];
  let montantTotal = 0;

  for (const payment of payments) {
    const row = worksheet.getRow(currentRow);
    const info = payment.informations || {};
    const unafData = payment.unafData || {};
    const options = payment.options || {};

    // A : Nom
    row.getCell('A').value = info.nom || payment.user?.nom || '';
    
    // B : Prénom
    row.getCell('B').value = info.prenom || payment.user?.prenom || '';
    
    // C - H : Adresse postale
    const adresse = info.adresse || {};
    row.getCell('C').value = (adresse.rue || '').trim();
    row.getCell('E').value = (adresse.complement || '').trim();
    row.getCell('F').value = (adresse.codePostal || '').trim();
    row.getCell('G').value = (adresse.ville || '').trim();
    row.getCell('H').value = (adresse.pays || 'France').trim();
    
    // I : Email
    row.getCell('I').value = info.email || payment.user?.email || '';
    
    // J - K : Téléphone
    row.getCell('J').value = info.telephone || '';
    row.getCell('K').value = info.telephoneMobile || '';
    
    // L : SIRET
    row.getCell('L').value = unafData.siret || '';
    
    // M : Nb ruches
    row.getCell('M').value = unafData.nombreRuches || '';
    
    // N : "1" si cotisation individuelle (toujours 1 pour UNAF)
    row.getCell('N').value = 1;
    counts.cotisationIndividuelle++;
    
    // O : "1" si revue papier
    if (options.revue?.choix === 'papier') {
      row.getCell('O').value = 1;
      counts.revuePapier++;
    }
    
    // P : "1" si revue numérique
    if (options.revue?.choix === 'numerique') {
      row.getCell('P').value = 1;
      counts.revueNumerique++;
    }
    
    // Q : "1" si revue papier & numérique
    if (options.revue?.choix === 'papier_numerique') {
      row.getCell('Q').value = 1;
      counts.revuePapierNumerique++;
    }
    
    // R : "1" si formule 1
    if (options.assurance?.formule === 'formule1') {
      row.getCell('R').value = 1;
      counts.formule1++;
    }
    
    // S : "1" si formule 2
    if (options.assurance?.formule === 'formule2') {
      row.getCell('S').value = 1;
      counts.formule2++;
    }
    
    // T : "1" si formule 3
    if (options.assurance?.formule === 'formule3') {
      row.getCell('T').value = 1;
      counts.formule3++;
    }
    
    // U : "1" si cotisation pour affaires juridiques
    if (options.affairesJuridiques?.souscrit) {
      row.getCell('U').value = 1;
      counts.affairesJuridiques++;
    }

    row.commit();
    currentRow++;
    montantTotal += payment.montant || 0;

    // Tracker les éléments inclus
    if (payment.type === 'initial') {
      servicesInclus.push(payment.serviceId);
    } else {
      modificationsIncluses.push({
        serviceId: payment.serviceId,
        modificationIndex: payment.modificationIndex,
      });
    }
  }

  // Remplir les quantités dans AA15-AA24
  worksheet.getCell('AA15').value = counts.cotisationIndividuelle;
  worksheet.getCell('AA16').value = counts.revuePapier;
  worksheet.getCell('AA17').value = counts.revueNumerique;
  worksheet.getCell('AA18').value = counts.revuePapierNumerique;
  worksheet.getCell('AA19').value = counts.formule1;
  worksheet.getCell('AA20').value = counts.formule2;
  worksheet.getCell('AA21').value = counts.formule3;
  worksheet.getCell('AA22').value = counts.affairesJuridiques;
  
  // Générer le buffer Excel
  const buffer = await workbook.xlsx.writeBuffer();

  // Upload vers S3
  const fileName = `UNAF_Export_${annee}_${exportDate.toISOString().split('T')[0]}.xlsx`;
  const uploadResult = await uploadFile(
    buffer,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'unaf-exports'
  );

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

  // Créer l'enregistrement d'export
  const exportRecord = await UNAFExport.create({
    dateExport: exportDate,
    annee: annee,
    isFirstExport: isFirst,
    s3Url: uploadResult.url,
    s3Key: uploadResult.key,
    nombrePaiements: payments.length,
    montantTotal: montantTotal,
    servicesInclus: servicesInclus,
    modificationsIncluses: modificationsIncluses,
    status: 'genere',
  });

  return {
    success: true,
    export: exportRecord,
    nombrePaiements: payments.length,
    montantTotal: montantTotal,
    s3Url: uploadResult.url,
  };
};

/**
 * Récupère tous les exports UNAF pour une année
 * @param {number} annee 
 * @returns {Promise<Array>}
 */
const getExportsByYear = async (annee) => {
  const exports = await UNAFExport.find({ annee }).sort({ dateExport: -1 });
  
  // Régénérer les URLs signées
  for (const exp of exports) {
    if (exp.s3Key) {
      try {
        exp.s3Url = await getSignedUrl(exp.s3Key, 3600); // 1 heure
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
