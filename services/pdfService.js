const PDFDocument = require('pdfkit');
const { uploadFile } = require('./s3Service');
const path = require('path');
const fs = require('fs');

// Chemins vers les logos des organismes
const LOGOS_PATH = path.join(__dirname, '../../frontend/public/logos');

/**
 * Génère un PDF de récapitulatif d'adhésion avec signature
 * @param {Object} adhesion - L'adhésion complète (avec user et ruches)
 * @param {string} signatureBase64 - La signature en base64
 * @returns {Promise<Buffer>} - Le PDF en buffer
 */
const generateAdhesionPDF = async (adhesion, signatureBase64) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Créer le document PDF
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Buffer pour stocker le PDF
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // En-tête
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .text('RÉCAPITULATIF D\'ADHÉSION', { align: 'center' });
      
      doc.moveDown();
      doc.fontSize(12)
         .font('Helvetica')
         .text(`Année ${adhesion.annee}`, { align: 'center' });
      
      doc.moveDown(2);

      // Informations adhérent
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .text('Informations de l\'adhérent');
      
      doc.moveDown(0.5);
      doc.fontSize(11)
         .font('Helvetica');

      const user = adhesion.user;
      doc.text(`Nom : ${user.nom} ${user.prenom}`);
      doc.text(`Email : ${user.email}`);
      doc.text(`Téléphone : ${user.telephone || 'Non renseigné'}`);
      doc.text(`Adresse : ${user.adresse || 'Non renseignée'}`);
      if (user.codePostal && user.ville) {
        doc.text(`${user.codePostal} ${user.ville}`);
      }
      doc.text(`Organisme : ${adhesion.organisme}`);
      
      doc.moveDown(1.5);

      // Informations adhésion
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .text('Détails de l\'adhésion');
      
      doc.moveDown(0.5);
      doc.fontSize(11)
         .font('Helvetica');

      doc.text(`Type : ${adhesion.type}`);
      doc.text(`Statut : ${adhesion.status}`);
      doc.text(`Date d'adhésion : ${new Date(adhesion.dateAdhesion).toLocaleDateString('fr-FR')}`);
      doc.text(`Montant : ${adhesion.montant} €`);
      
      if (adhesion.dateValidation) {
        doc.text(`Date de validation : ${new Date(adhesion.dateValidation).toLocaleDateString('fr-FR')}`);
      }

      doc.moveDown(1.5);

      // Ruches
      if (adhesion.ruches && adhesion.ruches.length > 0) {
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .text('Ruches déclarées');
        
        doc.moveDown(0.5);
        doc.fontSize(11)
           .font('Helvetica');

        doc.text(`Nombre total de ruches : ${adhesion.ruches.length}`);
        doc.moveDown(0.5);

        // Tableau des ruches
        const tableTop = doc.y;
        const colWidths = { numero: 80, commune: 150, codePostal: 80, nombre: 80 };
        const startX = 50;

        // En-têtes
        doc.font('Helvetica-Bold');
        doc.text('N° Rucher', startX, tableTop, { width: colWidths.numero, continued: true });
        doc.text('Commune', startX + colWidths.numero, tableTop, { width: colWidths.commune, continued: true });
        doc.text('Code Postal', startX + colWidths.numero + colWidths.commune, tableTop, { width: colWidths.codePostal, continued: true });
        doc.text('Nb Ruches', startX + colWidths.numero + colWidths.commune + colWidths.codePostal, tableTop, { width: colWidths.nombre });

        doc.moveDown(0.3);
        let currentY = doc.y;

        // Ligne de séparation
        doc.moveTo(startX, currentY)
           .lineTo(startX + colWidths.numero + colWidths.commune + colWidths.codePostal + colWidths.nombre, currentY)
           .stroke();

        doc.moveDown(0.3);
        currentY = doc.y;

        // Données
        doc.font('Helvetica');
        adhesion.ruches.forEach((ruche, index) => {
          if (currentY > 700) { // Nouvelle page si nécessaire
            doc.addPage();
            currentY = 50;
          }

          doc.text(ruche.numeroRucher || '-', startX, currentY, { width: colWidths.numero, continued: true });
          doc.text(ruche.commune || '-', startX + colWidths.numero, currentY, { width: colWidths.commune, continued: true });
          doc.text(ruche.codePostal || '-', startX + colWidths.numero + colWidths.commune, currentY, { width: colWidths.codePostal, continued: true });
          doc.text(ruche.nombreRuches?.toString() || '0', startX + colWidths.numero + colWidths.commune + colWidths.codePostal, currentY, { width: colWidths.nombre });

          doc.moveDown(0.5);
          currentY = doc.y;
        });

        doc.moveDown(1);
      }

      // Nouvelle page pour signature et cachet
      doc.addPage();

      // Signature
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text('Signature de l\'adhérent', 50, 100);
      
      if (signatureBase64) {
        try {
          // Convertir base64 en buffer
          const signatureData = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
          const signatureBuffer = Buffer.from(signatureData, 'base64');
          
          doc.image(signatureBuffer, 50, 130, {
            width: 250,
            height: 100
          });
        } catch (error) {
          console.error('Erreur insertion signature:', error);
          doc.fontSize(10)
             .font('Helvetica-Oblique')
             .text('Signature non disponible', 50, 130);
        }
      }

      doc.fontSize(10)
         .font('Helvetica')
         .text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 50, 250);

      // Footer
      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(
           `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
           50,
           doc.page.height - 60,
           { align: 'center', width: 495 }
         );

      // Finaliser le PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Génère et upload le PDF d'adhésion sur S3
 * @param {Object} adhesion - L'adhésion complète
 * @param {string} signatureBase64 - La signature en base64
 * @returns {Promise<Object>} - Informations du fichier uploadé
 */
const generateAndUploadAdhesionPDF = async (adhesion, signatureBase64) => {
  try {
    // Générer le PDF
    const pdfBuffer = await generateAdhesionPDF(adhesion, signatureBase64);

    // Définir le chemin S3
    const folder = `adhesions/${adhesion.annee}/${adhesion.organisme}`;
    const fileName = `adhesion-${adhesion._id}.pdf`;

    // Upload sur S3
    const result = await uploadFile(pdfBuffer, fileName, 'application/pdf', folder);

    return result;
  } catch (error) {
    console.error('Erreur génération/upload PDF:', error);
    throw new Error('Erreur lors de la génération du PDF d\'adhésion');
  }
};

/**
 * Génère une attestation d'adhésion officielle
 * @param {Object} adhesion - L'adhésion complète (avec user)
 * @returns {Promise<Buffer>} - Le PDF en buffer
 */
const generateAttestationPDF = async (adhesion) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Logo de l'organisme à gauche + en-tête à droite
      const logoFileName = adhesion.organisme === 'SAR' ? 'logo_sar.png' : 'logo_amair.png';
      const logoPath = path.join(LOGOS_PATH, logoFileName);
      
      const logoWidth = 80;
      const logoX = 50;
      const logoY = 40;
      const textX = logoX + logoWidth + 20;
      const textWidth = doc.page.width - textX - 50;
      
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, logoX, logoY, { width: logoWidth });
      }

      // En-tête avec titre (à droite du logo)
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text(
           adhesion.organisme === 'SAR' ? 'SYNDICAT APICOLE DE LA RÉUNION' : 'ASSOCIATION MAISON DE L\'APICULTURE DE LA RÉUNION',
           textX,
           logoY + 15,
           { width: textWidth, align: 'left' }
         );

      // Titre du document (à droite du logo)
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text(`ATTESTATION D'ADHÉSION ${adhesion.annee}`, textX, logoY + 40, { width: textWidth, align: 'left' });
      
      // Validité
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`Validité du 01 janvier au 31 décembre ${adhesion.annee}`, textX, logoY + 65, { width: textWidth, align: 'left' });
      
      // Repositionner le curseur après l'en-tête
      doc.y = logoY + logoWidth + 40;
      doc.x = 50;
      
      doc.moveDown(2);

      // Corps de l'attestation
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#000000');

      const user = adhesion.user;
      const nomComplet = `${user.nom} ${user.prenom}`;
      
      doc.text('Le présent document atteste que :', { align: 'left' });
      doc.moveDown(1);

      // Informations de l'adhérent - tableau sans bordure
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('ADHÉRENT');
      
      doc.moveDown(0.5);
      
      const attTableLeft = 50;
      const attColWidth = 247;
      const attLabelSize = 9;
      const attValueSize = 11;
      const attRowHeight = 32;
      
      let attY = doc.y;
      
      // Ligne 1 : Nom/Prénom
      doc.fontSize(attLabelSize).fillColor('#747474').font('Helvetica');
      doc.text('NOMS ET PRÉNOMS', attTableLeft, attY);
      
      doc.fontSize(attValueSize).fillColor('#000000').font('Helvetica-Bold');
      doc.text(nomComplet.toUpperCase(), attTableLeft, attY + 12);
      
      attY += attRowHeight;
      
      // Ligne 2 : Email | Téléphone
      doc.fontSize(attLabelSize).fillColor('#747474').font('Helvetica');
      doc.text('EMAIL', attTableLeft, attY);
      doc.text('TÉLÉPHONE', attTableLeft + attColWidth, attY);
      
      doc.fontSize(attValueSize).fillColor('#000000');
      doc.text(user.email || '-', attTableLeft, attY + 12);
      const tel = user.telephoneMobile || user.telephone || '-';
      doc.text(tel, attTableLeft + attColWidth, attY + 12);
      
      attY += attRowHeight;
      
      // Ligne 3 : Adresse
      if (user.adresse?.rue) {
        doc.fontSize(attLabelSize).fillColor('#747474');
        doc.text('ADRESSE', attTableLeft, attY);
        
        doc.fontSize(attValueSize).fillColor('#000000');
        const complement = user.adresse.complement ? ` ${user.adresse.complement}` : '';
        const adresse = `${user.adresse.rue}${complement}, ${user.adresse.codePostal} ${user.adresse.ville}`;
        doc.text(adresse, attTableLeft, attY + 12, { width: attColWidth * 2 });
        attY += attRowHeight;
      }
      
      doc.y = attY;
      doc.moveDown(1);

      // Texte d'attestation
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#000000');
      
      const organismeNom = adhesion.organisme === 'SAR' 
        ? 'Syndicat Apicole de La Réunion (SAR)' 
        : 'Association Maison de l\'Apiculture de La Réunion (AMAIR)';
      
      doc.text(`est adhérent(e) en règle du ${organismeNom} pour l'année ${adhesion.annee}.`, {
        align: 'left'
      });

      doc.moveDown(1.5);

      // Informations complémentaires
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('INFORMATIONS APICOLES');
      
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#000000').font('Helvetica');
      
      if (adhesion.napi) {
        doc.text(`Numéro NAPI : ${adhesion.napi}`);
      }
      if (adhesion.nombreRuches) {
        doc.text(`Nombre de ruches déclarées : ${adhesion.nombreRuches}`);
      }

      doc.moveDown(2);

      // Date et signature
      doc.fontSize(11)
         .font('Helvetica-Oblique')
         .text(`Fait à La Réunion le ${new Date(adhesion.dateValidation || adhesion.createdAt).toLocaleDateString('fr-FR', { 
           day: '2-digit', 
           month: 'long', 
           year: 'numeric' 
         })}`, { align: 'left' });

      doc.moveDown(1.5);
      doc.font('Helvetica')
         .text('Signature du Président :', { align: 'left' });

      // Pied de page
      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(
           `Document généré automatiquement le ${new Date().toLocaleDateString('fr-FR')} - Référence: ${adhesion._id}`,
           50,
           doc.page.height - 60,
           { align: 'center', width: 495 }
         );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Génère et upload l'attestation d'adhésion sur S3
 * @param {Object} adhesion - L'adhésion complète
 * @returns {Promise<Object>} - Informations du fichier uploadé
 */
const generateAndUploadAttestation = async (adhesion) => {
  try {
    const File = require('../models/fileModel');
    
    // Générer le PDF d'attestation
    const pdfBuffer = await generateAttestationPDF(adhesion);

    // Définir le chemin S3 dans le dossier attestations
    const folder = `attestations-adhesions/${adhesion.annee}`;
    const fileName = `attestation-${adhesion.organisme}-${adhesion._id}.pdf`;

    // Upload sur S3
    const result = await uploadFile(pdfBuffer, fileName, 'application/pdf', folder);

    // Créer une entrée dans la collection File
    await File.create({
      nom: `Attestation d'adhésion ${adhesion.organisme} ${adhesion.annee}`,
      nomOriginal: fileName,
      s3Key: result.key,
      s3Bucket: process.env.S3_BUCKET_NAME,
      mimeType: 'application/pdf',
      taille: pdfBuffer.length,
      type: 'attestation_adhesion',
      organisme: adhesion.organisme,
      adhesion: adhesion._id,
      uploadedBy: adhesion.user._id || adhesion.user
    });

    return result;
  } catch (error) {
    console.error('Erreur génération/upload attestation:', error);
    throw new Error('Erreur lors de la génération de l\'attestation d\'adhésion');
  }
};

/**
 * Génère un bulletin d'adhésion PDF
 * @param {Object} adhesion - L'adhésion complète (avec user)
 * @returns {Promise<Buffer>} - Le PDF en buffer
 */
const generateBulletinAdhesionPDF = async (adhesion) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Logo de l'organisme à gauche + en-tête à droite
      const logoFileName = adhesion.organisme === 'SAR' ? 'logo_sar.png' : 'logo_amair.png';
      const logoPath = path.join(LOGOS_PATH, logoFileName);
      
      const logoWidth = 80;
      const logoX = 50;
      const logoY = 40;
      const textX = logoX + logoWidth + 20; // Position du texte à droite du logo
      const textWidth = doc.page.width - textX - 50; // Largeur disponible pour le texte
      
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, logoX, logoY, { width: logoWidth });
      }

      // En-tête avec titre (à droite du logo)
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text(
           adhesion.organisme === 'SAR' ? 'SYNDICAT APICOLE DE LA RÉUNION' : 'ASSOCIATION MAISON DE L\'APICULTURE DE LA RÉUNION',
           textX,
           logoY + 15,
           { width: textWidth, align: 'left' }
         );

      // Titre du document (à droite du logo)
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text(`BULLETIN D'ADHÉSION ${adhesion.annee}`, textX, logoY + 40, { width: textWidth, align: 'left' });
      
      // Validité
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`Validité de l’adhésion du 01 janvier au 31 décembre ${adhesion.annee}`, textX, logoY + 65, { width: textWidth, align: 'left' });
      
      // Repositionner le curseur après l'en-tête
      doc.y = logoY + logoWidth;
      doc.x = 50;
      
      doc.moveDown(2);

      // Informations de l'adhérent
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('INFORMATIONS DE L\'ADHÉRENT');
      
      doc.moveDown(0.5);

      const user = adhesion.user;
      
      // Tableau à deux colonnes sans bordure
      const userTableLeft = 50;
      const colWidth = 247; // (495 / 2)
      const labelSize = 9;
      const valueSize = 11;
      const userRowHeight = 34;
      
      let userY = doc.y;
      
      // Ligne 1 : Nom/Prénom | Date de naissance
      doc.fontSize(labelSize).fillColor('#747474').font('Helvetica');
      doc.text('NOMS ET PRÉNOMS', userTableLeft, userY);
      doc.text('DATE DE NAISSANCE', userTableLeft + colWidth, userY);
      
      doc.fontSize(valueSize).fillColor('#000000');
      doc.text(`${user.nom} ${user.prenom}`, userTableLeft, userY + 12);
      doc.text(user.dateNaissance ? new Date(user.dateNaissance).toLocaleDateString('fr-FR') : '-', userTableLeft + colWidth, userY + 12);
      
      userY += userRowHeight;
      
      // Ligne 2 : Email | Téléphone
      doc.fontSize(labelSize).fillColor('#747474');
      doc.text('EMAIL', userTableLeft, userY);
      doc.text('TÉLÉPHONE', userTableLeft + colWidth, userY);
      
      doc.fontSize(valueSize).fillColor('#000000');
      doc.text(user.email || '-', userTableLeft, userY + 12);
      const tel = user.telephoneMobile || user.telephone || '-';
      doc.text(tel, userTableLeft + colWidth, userY + 12);
      
      userY += userRowHeight;
      
      // Ligne 3 : Adresse (pleine largeur)
      if (user.adresse?.rue) {
        doc.fontSize(labelSize).fillColor('#747474');
        doc.text('ADRESSE', userTableLeft, userY);
        
        doc.fontSize(valueSize).fillColor('#000000');
        const complement = user.adresse.complement ? ` ${user.adresse.complement}` : '';
        const adresse = `${user.adresse.rue}${complement}, ${user.adresse.codePostal} ${user.adresse.ville}${user.adresse.pays ? ', ' + user.adresse.pays : ''}`;
        doc.text(adresse, userTableLeft, userY + 12, { width: colWidth * 2 });
        userY += userRowHeight;
      }
      
      doc.y = userY;
      doc.moveDown(1);

      // Informations apicoles
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('INFORMATIONS APICOLES');

      doc.moveDown(0.5);
      
      // Tableau à deux colonnes sans bordure
      const apiTableLeft = 50;
      const apiColWidth = 247;
      const apiLabelSize = 9;
      const apiValueSize = 11;
      const apiRowHeight = 34;
      
      let apiY = doc.y;
      
      // Ligne 1 : NAPI | AMEXA
      doc.fontSize(apiLabelSize).fillColor('#747474').font('Helvetica');
      doc.text('NUMÉRO NAPI', apiTableLeft, apiY);
      doc.text('NUMÉRO AMEXA', apiTableLeft + apiColWidth, apiY);
      
      doc.fontSize(apiValueSize).fillColor('#000000');
      doc.text(adhesion.napi || '-', apiTableLeft, apiY + 12);
      doc.text(adhesion.numeroAmexa || '-', apiTableLeft + apiColWidth, apiY + 12);
      
      apiY += apiRowHeight;
      
      // Ligne 2 : SIRET | Nombre de ruches
      doc.fontSize(apiLabelSize).fillColor('#747474');
      doc.text('SIRET', apiTableLeft, apiY);
      doc.text('NOMBRE DE RUCHES', apiTableLeft + apiColWidth, apiY);
      
      doc.fontSize(apiValueSize).fillColor('#000000');
      doc.text(adhesion.siret || '-', apiTableLeft, apiY + 12);
      doc.text(adhesion.nombreRuches ? String(adhesion.nombreRuches) : '-', apiTableLeft + apiColWidth, apiY + 12);
      
      apiY += apiRowHeight;
      
      // Ligne 3 : Nombre d'emplacements | Département
      doc.fontSize(apiLabelSize).fillColor('#747474');
      doc.text('NOMBRE D\'EMPLACEMENTS', apiTableLeft, apiY);
      doc.text('DÉPARTEMENT, COMMUNE', apiTableLeft + apiColWidth, apiY);
      
      doc.fontSize(apiValueSize).fillColor('#000000');
      doc.text(adhesion.nombreRuchers ? String(adhesion.nombreRuchers) : '-', apiTableLeft, apiY + 12);
      doc.text(`${adhesion.localisation?.departement} ${adhesion.localisation?.commune}` || '-', apiTableLeft + apiColWidth, apiY + 12);
      
      apiY += apiRowHeight;
            
      doc.y = apiY;
      doc.x = apiTableLeft;
      doc.moveDown(0.5);

      // Informations de cotisation
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('COTISATION');

      doc.moveDown(0.2);
      
      // Tableau de cotisation
      const tableTop = doc.y;
      const tableLeft = 50;
      const col1Width = 320;
      const col2Width = 80;
      const col3Width = 95;
      const rowHeight = 22;
      
      doc.fontSize(10).font('Helvetica');
      
      // En-tête du tableau
      doc.rect(tableLeft, tableTop, col1Width + col2Width + col3Width, rowHeight)
         .fill('#E98E09');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold');
      doc.text('Désignation', tableLeft + 5, tableTop + 6, { width: col1Width });
      doc.text('Calcul', tableLeft + col1Width + 5, tableTop + 6, { width: col2Width });
      doc.text('Montant', tableLeft + col1Width + col2Width + 50, tableTop + 6, { width: col3Width });
      
      let currentRow = tableTop + rowHeight;
      let total = 0;
      
      if (adhesion.organisme === 'SAR') {
        // ===== TARIFICATION SAR =====
        const droitEntree = adhesion.estNouveau ? 7.00 : 0;
        const cotisationBase = 28.00;
        const prixParRuche = 0.25;
        const nombreRuches = adhesion.nombreRuches || 0;
        const cotisationRuches = prixParRuche * nombreRuches;
        total = droitEntree + cotisationBase + cotisationRuches;
        
        // Ligne 1 - Droit d'entrée
        doc.rect(tableLeft, currentRow, col1Width + col2Width + col3Width, rowHeight).stroke('#CCCCCC');
        doc.fillColor('#000000').font('Helvetica');
        doc.fontSize(9).text('Droit d\'entrée (payable une seule fois pour les nouveaux adhérents)', tableLeft + 5, currentRow + 6, { width: col1Width - 10 });
        doc.fontSize(10).text(`7,00€ x ${adhesion.estNouveau ? '1' : '0'}`, tableLeft + col1Width + 5, currentRow + 6, { width: col2Width });
        doc.text(`${droitEntree.toFixed(2)} €`, tableLeft + col1Width + col2Width - 6, currentRow + 6, { width: col3Width, align: 'right' });
        
        // Ligne 2 - Cotisation de base
        currentRow += rowHeight;
        doc.rect(tableLeft, currentRow, col1Width + col2Width + col3Width, rowHeight).stroke('#CCCCCC');
        doc.text('Cotisation annuelle de base', tableLeft + 5, currentRow + 6, { width: col1Width });
        doc.text('28,00€ x 1', tableLeft + col1Width + 5, currentRow + 6, { width: col2Width });
        doc.text(`${cotisationBase.toFixed(2)} €`, tableLeft + col1Width + col2Width - 6, currentRow + 6, { width: col3Width, align: 'right' });
        
        // Ligne 3 - Cotisation par ruche
        currentRow += rowHeight;
        doc.rect(tableLeft, currentRow, col1Width + col2Width + col3Width, rowHeight).stroke('#CCCCCC');
        doc.text('Cotisation par ruche (0,25€ par ruche)', tableLeft + 5, currentRow + 6, { width: col1Width });
        doc.text(`0,25€ x ${nombreRuches}`, tableLeft + col1Width + 5, currentRow + 6, { width: col2Width });
        doc.text(`${cotisationRuches.toFixed(2)} €`, tableLeft + col1Width + col2Width - 6, currentRow + 6, { width: col3Width, align: 'right' });
        
      } else if (adhesion.organisme === 'AMAIR') {
        // ===== TARIFICATION AMAIR =====
        const isAdherentSAR = adhesion.informationsSpecifiques?.AMAIR?.adherentSAR || false;
        const cotisationFixe = isAdherentSAR ? 0 : 50.00;
        total = cotisationFixe;
        
        // Ligne 1 - Cotisation fixe
        doc.rect(tableLeft, currentRow, col1Width + col2Width + col3Width, rowHeight).stroke('#CCCCCC');
        doc.fillColor('#000000').font('Helvetica');
        doc.fontSize(10).text('Cotisation annuelle fixe', tableLeft + 5, currentRow + 6, { width: col1Width });
        doc.text(isAdherentSAR ? 'Adhérent SAR' : '50,00€ x 1', tableLeft + col1Width + 5, currentRow + 6, { width: col2Width });
        doc.text(`${cotisationFixe.toFixed(2)} €`, tableLeft + col1Width + col2Width - 6, currentRow + 6, { width: col3Width, align: 'right' });
        
        // Ligne 2 - Note adhérent SAR si applicable
        if (isAdherentSAR) {
          currentRow += rowHeight;
          doc.rect(tableLeft, currentRow, col1Width + col2Width + col3Width, rowHeight).stroke('#CCCCCC');
          doc.fillColor('#16a34a').font('Helvetica-Oblique');
          doc.fontSize(9).text('Adhésion gratuite pour les adhérents du Syndicat Apicole de La Réunion', tableLeft + 5, currentRow + 6, { width: col1Width + col2Width });
          doc.text('0,00 €', tableLeft + col1Width + col2Width - 6, currentRow + 6, { width: col3Width, align: 'right' });
        }
      }
      
      // Ligne Total
      currentRow += rowHeight;
      doc.rect(tableLeft, currentRow, col1Width + col2Width + col3Width, rowHeight).fill('#F3F4F6');
      doc.fillColor('#000000').font('Helvetica-Bold');
      doc.text('TOTAL', tableLeft + 5, currentRow + 6, { width: col1Width + col2Width });
      doc.text(`${total.toFixed(2)} €`, tableLeft + col1Width + col2Width - 6, currentRow + 6, { width: col3Width, align: 'right' });
      
      doc.y = currentRow + rowHeight + 15;
      
      // Case cochée - Déclaration d'adhésion
      doc.font('Helvetica').fontSize(11).fillColor('#000000');
      const checkboxY = doc.y;
      
      // Dessiner la case cochée
      doc.rect(50, checkboxY, 12, 12).stroke('#000000');
      // Dessiner le check (✓)
      doc.strokeColor('#E98E09').lineWidth(2);
      doc.moveTo(52, checkboxY + 6)
         .lineTo(55, checkboxY + 9)
         .lineTo(60, checkboxY + 3)
         .stroke();
      doc.strokeColor('#000000').lineWidth(1);
      
      const orgLabel = adhesion.organisme === 'SAR' 
        ? 'Syndicat Apicole de La Réunion (SAR)' 
        : 'Association Maison de l\'Apiculture de La Réunion (AMAIR)';
      doc.text(`Je déclare adhérer au ${orgLabel}`, 70, checkboxY, { width: 450 });
      
      doc.moveDown(2);

      // Date et signature
      doc.fontSize(11)
         .font('Helvetica-Oblique')
         .text(`Fait à La Réunion le ${new Date(adhesion.createdAt).toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })}`, { align: 'left' });

      doc.moveDown(1.5);
      doc.font('Helvetica')
         .text('Signature de l\'adhérent :', { align: 'left' });

      // Afficher la signature de l'adhérent si disponible
      if (adhesion.signature) {
        try {
          // La signature est stockée en base64
          const signatureData = adhesion.signature.replace(/^data:image\/\w+;base64,/, '');
          const signatureBuffer = Buffer.from(signatureData, 'base64');
          
          doc.moveDown(0.5);
          doc.image(signatureBuffer, doc.x, doc.y, { 
            width: 150,
            height: 60
          });
          doc.y += 70;
        } catch (signatureError) {
          console.error('Erreur lors de l\'ajout de la signature:', signatureError);
          doc.moveDown(2);
        }
      } else {
        doc.moveDown(2);
      }

      // Pied de page
      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(
           `Document généré automatiquement le ${new Date().toLocaleDateString('fr-FR')} - Référence: ${adhesion._id}`,
           50,
           doc.page.height - 60,
           { align: 'center', width: 495 }
         );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Génère et upload le bulletin d'adhésion sur S3
 * @param {Object} adhesion - L'adhésion complète
 * @returns {Promise<Object>} - Informations du fichier uploadé
 */
const generateAndUploadBulletinAdhesion = async (adhesion) => {
  try {
    const File = require('../models/fileModel');
    
    // Générer le PDF du bulletin
    const pdfBuffer = await generateBulletinAdhesionPDF(adhesion);

    // Définir le chemin S3 dans le dossier bulletins
    const folder = `bulletins-adhesions/${adhesion.annee}`;
    const fileName = `bulletin-${adhesion.organisme}-${adhesion._id}.pdf`;

    // Upload sur S3
    const result = await uploadFile(pdfBuffer, fileName, 'application/pdf', folder);

    // Créer une entrée dans la collection File
    await File.create({
      nom: `Bulletin d'adhésion ${adhesion.organisme} ${adhesion.annee}`,
      nomOriginal: fileName,
      s3Key: result.key,
      s3Bucket: process.env.S3_BUCKET_NAME,
      mimeType: 'application/pdf',
      taille: pdfBuffer.length,
      type: 'bulletin_adhesion',
      organisme: adhesion.organisme,
      adhesion: adhesion._id,
      uploadedBy: adhesion.user._id || adhesion.user
    });

    return result;
  } catch (error) {
    console.error('Erreur génération/upload bulletin:', error);
    throw new Error('Erreur lors de la génération du bulletin d\'adhésion');
  }
};

/**
 * Génère une attestation de souscription au service Assurance UNAF
 * @param {Object} service - Le service complet (avec user et unafData)
 * @returns {Promise<Buffer>} - Le PDF en buffer
 */
const generateUNAFAttestationPDF = async (service) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      const user = service.user;
      const unafData = service.unafData || {};
      const infos = service.informationsPersonnelles || user;

      // Logo de l'organisme à gauche + en-tête à droite
      const logoPath = path.join(LOGOS_PATH, 'logo_sar.png');
      
      const logoWidth = 80;
      const logoX = 50;
      const logoY = 40;
      const textX = logoX + logoWidth + 20;
      const textWidth = doc.page.width - textX - 50;
      
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, logoX, logoY, { width: logoWidth });
      }

      // En-tête avec titre (à droite du logo)
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('SYNDICAT APICOLE DE LA RÉUNION', textX, logoY + 10, { width: textWidth, align: 'left' });
      
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#666666')
         .text('Membre de l\'Union Nationale de l\'Apiculture Française (UNAF)', textX, logoY + 25, { width: textWidth, align: 'left' });

      // Titre du document (à droite du logo)
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text('ATTESTATION ASSURANCE UNAF', textX, logoY + 45, { width: textWidth, align: 'left' });
      
      // Année
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`Année ${service.annee}`, textX, logoY + 70, { width: textWidth, align: 'left' });
      
      // Repositionner le curseur après l'en-tête
      doc.y = logoY + logoWidth + 40;
      doc.x = 50;
      
      doc.moveDown(1);

      // Corps de l'attestation
      const nomComplet = `${user.nom || infos.nom} ${user.prenom || infos.prenom}`;
      
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#000000')
         .text('Le Syndicat Apicole de La Réunion atteste que :', { align: 'left' });
      doc.moveDown(1);

      // Informations du souscripteur - tableau sans bordure
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('SOUSCRIPTEUR');
      
      doc.moveDown(0.5);
      
      const unafTableLeft = 50;
      const unafColWidth = 247;
      const unafLabelSize = 9;
      const unafValueSize = 11;
      const unafRowHeight = 32;
      
      let unafY = doc.y;
      
      // Ligne 1 : Nom/Prénom | SIRET
      doc.fontSize(unafLabelSize).fillColor('#747474').font('Helvetica');
      doc.text('NOMS ET PRÉNOMS', unafTableLeft, unafY);
      doc.text('SIRET', unafTableLeft + unafColWidth, unafY);
      
      doc.fontSize(unafValueSize).fillColor('#000000').font('Helvetica-Bold');
      doc.text(nomComplet.toUpperCase(), unafTableLeft, unafY + 12);
      doc.font('Helvetica').text(unafData.siret || '-', unafTableLeft + unafColWidth, unafY + 12);
      
      unafY += unafRowHeight;
      
      // Ligne 2 : Email | Téléphone
      doc.fontSize(unafLabelSize).fillColor('#747474').font('Helvetica');
      doc.text('EMAIL', unafTableLeft, unafY);
      doc.text('TÉLÉPHONE', unafTableLeft + unafColWidth, unafY);
      
      doc.fontSize(unafValueSize).fillColor('#000000');
      doc.text(infos.email || user.email || '-', unafTableLeft, unafY + 12);
      const unafTel = infos.telephone || user.telephoneMobile || user.telephone || '-';
      doc.text(unafTel, unafTableLeft + unafColWidth, unafY + 12);
      
      unafY += unafRowHeight;
      
      // Ligne 3 : Adresse
      const unafAdresse = infos.adresse || user.adresse;
      if (unafAdresse?.rue) {
        doc.fontSize(unafLabelSize).fillColor('#747474');
        doc.text('ADRESSE', unafTableLeft, unafY);
        
        doc.fontSize(unafValueSize).fillColor('#000000');
        const complement = unafAdresse.complement ? ` ${unafAdresse.complement}` : '';
        const adresseText = `${unafAdresse.rue}${complement}, ${unafAdresse.codePostal} ${unafAdresse.ville}`;
        doc.text(adresseText, unafTableLeft, unafY + 12, { width: unafColWidth * 2 });
        unafY += unafRowHeight;
      }
      
      doc.y = unafY;
      doc.moveDown(1);

      // Texte d'attestation
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`a souscrit à l'Assurance UNAF via le Syndicat Apicole de La Réunion pour l'année ${service.annee}.`, {
           align: 'left'
         });

      doc.moveDown(1.5);

      // Détails de la souscription
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('DÉTAILS DE LA SOUSCRIPTION');
      
      doc.moveDown(0.3);
      
      // Infos ruches/emplacements
      doc.fontSize(10).fillColor('#000000').font('Helvetica');
      doc.text(`Nombre de ruches déclarées : ${unafData.nombreRuches || 0}  |  Nombre d'emplacements : ${unafData.nombreEmplacements || 0}`);
      
      doc.moveDown(0.8);
      
      // Tableau de cotisation UNAF
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('COTISATION');

      doc.moveDown(0.2);
      
      const options = unafData.options || {};
      const detailMontants = unafData.detailMontants || {};
      
      // Tableau de cotisation
      const cotTableTop = doc.y;
      const cotTableLeft = 50;
      const cotCol1Width = 320;
      const cotCol2Width = 80;
      const cotCol3Width = 95;
      const cotRowHeight = 22;
      
      doc.fontSize(10).font('Helvetica');
      
      // En-tête du tableau
      doc.rect(cotTableLeft, cotTableTop, cotCol1Width + cotCol2Width + cotCol3Width, cotRowHeight)
         .fill('#E98E09');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold');
      doc.text('Désignation', cotTableLeft + 5, cotTableTop + 6, { width: cotCol1Width });
      doc.text('Option', cotTableLeft + cotCol1Width + 5, cotTableTop + 6, { width: cotCol2Width });
      doc.text('Montant', cotTableLeft + cotCol1Width + cotCol2Width + 50, cotTableTop + 6, { width: cotCol3Width });
      
      let cotCurrentRow = cotTableTop + cotRowHeight;
      
      // Ligne 1 - Formule d'assurance
      const formuleAssurance = options.assurance?.formule?.replace('formule', 'Formule ') || 'Non spécifiée';
      doc.rect(cotTableLeft, cotCurrentRow, cotCol1Width + cotCol2Width + cotCol3Width, cotRowHeight).stroke('#CCCCCC');
      doc.fillColor('#000000').font('Helvetica');
      doc.text('Assurance UNAF', cotTableLeft + 5, cotCurrentRow + 6, { width: cotCol1Width });
      doc.text(formuleAssurance, cotTableLeft + cotCol1Width + 5, cotCurrentRow + 6, { width: cotCol2Width });
      doc.text(`${(detailMontants.assurance || 0).toFixed(2)} €`, cotTableLeft + cotCol1Width + cotCol2Width - 6, cotCurrentRow + 6, { width: cotCol3Width, align: 'right' });
      
      cotCurrentRow += cotRowHeight;
      
      // Ligne 2 - Revue (si souscrite)
      if (options.revue?.choix && options.revue.choix !== 'aucun') {
        const revueLabel = {
          'papier': 'Papier',
          'numerique': 'Numérique',
          'papier_numerique': 'Papier + Num.'
        };
        doc.rect(cotTableLeft, cotCurrentRow, cotCol1Width + cotCol2Width + cotCol3Width, cotRowHeight).stroke('#CCCCCC');
        doc.text('Revue "Abeilles & Fleurs"', cotTableLeft + 5, cotCurrentRow + 6, { width: cotCol1Width });
        doc.text(revueLabel[options.revue.choix] || options.revue.choix, cotTableLeft + cotCol1Width + 5, cotCurrentRow + 6, { width: cotCol2Width });
        doc.text(`${(detailMontants.revue || 0).toFixed(2)} €`, cotTableLeft + cotCol1Width + cotCol2Width - 6, cotCurrentRow + 6, { width: cotCol3Width, align: 'right' });
        cotCurrentRow += cotRowHeight;
      }
      
      // Ligne 3 - Affaires Juridiques (si souscrit)
      if (options.affairesJuridiques?.souscrit) {
        doc.rect(cotTableLeft, cotCurrentRow, cotCol1Width + cotCol2Width + cotCol3Width, cotRowHeight).stroke('#CCCCCC');
        doc.text('Cotisation Affaires Juridiques', cotTableLeft + 5, cotCurrentRow + 6, { width: cotCol1Width });
        doc.text('Oui', cotTableLeft + cotCol1Width + 5, cotCurrentRow + 6, { width: cotCol2Width });
        doc.text(`${(detailMontants.affairesJuridiques || 0).toFixed(2)} €`, cotTableLeft + cotCol1Width + cotCol2Width - 6, cotCurrentRow + 6, { width: cotCol3Width, align: 'right' });
        cotCurrentRow += cotRowHeight;
      }
      
      // Ligne 4 - Écocontribution (si souscrit)
      if (options.ecocontribution?.souscrit) {
        doc.rect(cotTableLeft, cotCurrentRow, cotCol1Width + cotCol2Width + cotCol3Width, cotRowHeight).stroke('#CCCCCC');
        doc.text('Écocontribution', cotTableLeft + 5, cotCurrentRow + 6, { width: cotCol1Width });
        doc.text('Oui', cotTableLeft + cotCol1Width + 5, cotCurrentRow + 6, { width: cotCol2Width });
        doc.text(`${(detailMontants.ecocontribution || 0).toFixed(2)} €`, cotTableLeft + cotCol1Width + cotCol2Width - 6, cotCurrentRow + 6, { width: cotCol3Width, align: 'right' });
        cotCurrentRow += cotRowHeight;
      }
      
      // Ligne Total
      const total = service.paiement?.montant || detailMontants.total || 0;
      doc.rect(cotTableLeft, cotCurrentRow, cotCol1Width + cotCol2Width + cotCol3Width, cotRowHeight).fill('#F3F4F6');
      doc.fillColor('#000000').font('Helvetica-Bold');
      doc.text('TOTAL', cotTableLeft + 5, cotCurrentRow + 6, { width: cotCol1Width + cotCol2Width });
      doc.text(`${total.toFixed(2)} €`, cotTableLeft + cotCol1Width + cotCol2Width - 6, cotCurrentRow + 6, { width: cotCol3Width, align: 'right' });
      
      doc.y = cotCurrentRow + cotRowHeight + 15;

      doc.font('Helvetica').fontSize(11).fillColor('#000000')
         .text(`Date de validation : ${new Date(service.dateValidation || service.createdAt).toLocaleDateString('fr-FR', { 
           day: '2-digit', 
           month: 'long', 
           year: 'numeric' 
         })}`);

      doc.moveDown(2);

      // Date et signature
      doc.fontSize(11)
         .font('Helvetica-Oblique')
         .text(`Fait à La Réunion le ${new Date().toLocaleDateString('fr-FR', { 
           day: '2-digit', 
           month: 'long', 
           year: 'numeric' 
         })}`, { align: 'left' });

      doc.moveDown(1.5);
      doc.font('Helvetica')
         .text('Signature du Président :', { align: 'left' });

      // Pied de page
      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(
           `Document généré automatiquement le ${new Date().toLocaleDateString('fr-FR')} - Référence: ${service._id}`,
           50,
           doc.page.height - 60,
           { align: 'center', width: 495 }
         );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Génère une attestation de souscription à un service
 * @param {Object} service - Le service complet (avec user)
 * @returns {Promise<Buffer>} - Le PDF en buffer
 */
const generateServiceAttestationPDF = async (service) => {
  // Si c'est un service UNAF, utiliser la génération spécifique
  if (service.typeService === 'assurance_unaf') {
    return generateUNAFAttestationPDF(service);
  }

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Logo de l'organisme à gauche + en-tête à droite
      const logoPath = path.join(LOGOS_PATH, 'logo_amair.png');
      
      const logoWidth = 80;
      const logoX = 50;
      const logoY = 40;
      const textX = logoX + logoWidth + 20;
      const textWidth = doc.page.width - textX - 50;
      
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, logoX, logoY, { width: logoWidth });
      }

      // En-tête avec titre (à droite du logo)
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('ASSOCIATION MAISON DE L\'APICULTURE DE LA RÉUNION', textX, logoY + 15, { width: textWidth, align: 'left' });

      // Titre du document (à droite du logo)
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text('ATTESTATION DE SOUSCRIPTION', textX, logoY + 40, { width: textWidth, align: 'left' });
      
      // Nom du service
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#E98E09')
         .text(service.nom.toUpperCase(), textX, logoY + 65, { width: textWidth, align: 'left' });
      
      // Repositionner le curseur après l'en-tête
      doc.y = logoY + logoWidth + 40;
      doc.x = 50;
      
      doc.moveDown(2);

      // Corps de l'attestation
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#000000');

      const user = service.user;
      const nomComplet = `${user.nom} ${user.prenom}`;
      const infos = service.informationsPersonnelles || user;
      
      doc.text('Le présent document atteste que :', { align: 'left' });
      doc.moveDown(1);

      // Informations du souscripteur - tableau sans bordure
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('SOUSCRIPTEUR');
      
      doc.moveDown(0.5);
      
      const svcTableLeft = 50;
      const svcColWidth = 247;
      const svcLabelSize = 9;
      const svcValueSize = 11;
      const svcRowHeight = 32;
      
      let svcY = doc.y;
      
      // Ligne 1 : Nom/Prénom
      doc.fontSize(svcLabelSize).fillColor('#747474').font('Helvetica');
      doc.text('NOMS ET PRÉNOMS', svcTableLeft, svcY);
      
      doc.fontSize(svcValueSize).fillColor('#000000').font('Helvetica-Bold');
      doc.text(nomComplet.toUpperCase(), svcTableLeft, svcY + 12);
      
      svcY += svcRowHeight;
      
      // Ligne 2 : Email | Téléphone
      doc.fontSize(svcLabelSize).fillColor('#747474').font('Helvetica');
      doc.text('EMAIL', svcTableLeft, svcY);
      doc.text('TÉLÉPHONE', svcTableLeft + svcColWidth, svcY);
      
      doc.fontSize(svcValueSize).fillColor('#000000');
      doc.text(infos.email || user.email || '-', svcTableLeft, svcY + 12);
      const svcTel = infos.telephone || user.telephoneMobile || user.telephone || '-';
      doc.text(svcTel, svcTableLeft + svcColWidth, svcY + 12);
      
      svcY += svcRowHeight;
      
      // Ligne 3 : Adresse
      const adresse = infos.adresse || user.adresse;
      if (adresse?.rue) {
        doc.fontSize(svcLabelSize).fillColor('#747474');
        doc.text('ADRESSE', svcTableLeft, svcY);
        
        doc.fontSize(svcValueSize).fillColor('#000000');
        const complement = adresse.complement ? ` ${adresse.complement}` : '';
        const adresseText = `${adresse.rue}${complement}, ${adresse.codePostal} ${adresse.ville}`;
        doc.text(adresseText, svcTableLeft, svcY + 12, { width: svcColWidth * 2 });
        svcY += svcRowHeight;
      }
      
      doc.y = svcY;
      doc.moveDown(1);

      // Texte d'attestation
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#000000');
      
      doc.text(`a souscrit au service "${service.nom}" de l'Association Maison de l'Apiculture de La Réunion (AMAIR) pour l'année ${service.annee}.`, {
        align: 'left'
      });

      doc.moveDown(1.5);

      // Informations sur le service
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#E98E09')
         .text('DÉTAILS DE LA SOUSCRIPTION');
      
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#000000').font('Helvetica');
      doc.text(`Droit d'usage : ${service.paiement?.montant || 0} €`);
      if (service.caution?.montant) {
        doc.text(`Caution déposée : ${service.caution.montant} €`);
      }
      doc.text(`Date de validation : ${new Date(service.dateValidation || service.createdAt).toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })}`);

      doc.moveDown(1.5);

      // Note sur la caution
      if (service.caution?.montant) {
        doc.fontSize(10)
           .font('Helvetica-Oblique')
           .fillColor('#666666')
           .text('Note : Le chèque de caution sera conservé et restitué en fin d\'année, sauf en cas de dégradation du matériel.', {
             align: 'left'
           });
        doc.moveDown(1);
      }

      // Date et signature
      doc.fontSize(11)
         .fillColor('#000000')
         .font('Helvetica-Oblique')
         .text(`Fait à La Réunion le ${new Date().toLocaleDateString('fr-FR', { 
           day: '2-digit', 
           month: 'long', 
           year: 'numeric' 
         })}`, { align: 'left' });

      doc.moveDown(1.5);
      doc.font('Helvetica')
         .text('Signature du Président :', { align: 'left' });

      // Pied de page
      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(
           `Document généré automatiquement le ${new Date().toLocaleDateString('fr-FR')} - Référence: ${service._id}`,
           50,
           doc.page.height - 60,
           { align: 'center', width: 495 }
         );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Génère et upload l'attestation de souscription au service sur S3
 * @param {Object} service - Le service complet
 * @returns {Promise<Object>} - Informations du fichier uploadé
 */
const generateAndUploadServiceAttestation = async (service) => {
  try {
    const File = require('../models/fileModel');
    
    // Générer le PDF d'attestation
    const pdfBuffer = await generateServiceAttestationPDF(service);

    // Définir le chemin S3 dans le dossier attestations-services
    const folder = `attestations-services/${service.annee}`;
    const fileName = `attestation-service-${service.typeService}-${service._id}.pdf`;

    // Upload sur S3
    const result = await uploadFile(pdfBuffer, fileName, 'application/pdf', folder);

    // Créer une entrée dans la collection File
    await File.create({
      nom: `Attestation ${service.nom} ${service.annee}`,
      nomOriginal: fileName,
      s3Key: result.key,
      s3Bucket: process.env.S3_BUCKET_NAME,
      mimeType: 'application/pdf',
      taille: pdfBuffer.length,
      type: 'attestation_service',
      organisme: service.organisme,
      service: service._id,
      uploadedBy: service.user._id || service.user
    });

    return result;
  } catch (error) {
    console.error('Erreur génération/upload attestation service:', error);
    throw new Error('Erreur lors de la génération de l\'attestation de service');
  }
};

module.exports = {
  generateAdhesionPDF,
  generateAndUploadAdhesionPDF,
  generateAttestationPDF,
  generateAndUploadAttestation,
  generateBulletinAdhesionPDF,
  generateAndUploadBulletinAdhesion,
  generateUNAFAttestationPDF,
  generateServiceAttestationPDF,
  generateAndUploadServiceAttestation
};
