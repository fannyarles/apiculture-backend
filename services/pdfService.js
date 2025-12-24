const PDFDocument = require('pdfkit');
const { uploadFile } = require('./s3Service');

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
         .text(
           `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
           50,
           750,
           { align: 'center' }
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

      // En-tête avec logo/titre
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .fillColor('#2563eb')
         .text(adhesion.organisme === 'SAR' ? 'SYNDICAT APICOLE DE LA RÉUNION' : 'ASSOCIATION MAISON DE L\'APICULTURE', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(12)
         .fillColor('#000000')
         .font('Helvetica')
         .text(adhesion.organisme === 'SAR' ? '(SAR)' : 'DE L\'ÎLE DE LA RÉUNION (AMAIR)', { align: 'center' });
      
      doc.moveDown(3);

      // Titre du document
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor('#1e40af')
         .text('ATTESTATION D\'ADHÉSION', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(14)
         .fillColor('#000000')
         .font('Helvetica')
         .text(`Année ${adhesion.annee}`, { align: 'center' });
      
      doc.moveDown(3);

      // Corps de l'attestation
      doc.fontSize(12)
         .font('Helvetica');

      const user = adhesion.user;
      const nomComplet = `${user.prenom} ${user.nom}`;
      
      doc.text('Le présent document atteste que :', { align: 'left' });
      doc.moveDown(1);

      // Informations de l'adhérent en encadré
      const boxY = doc.y;
      doc.rect(50, boxY, 495, 120)
         .stroke('#2563eb');
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text(nomComplet.toUpperCase(), 70, boxY + 20);
      
      doc.fontSize(11)
         .font('Helvetica');
      
      if (user.adresse?.rue) {
        doc.text(`${user.adresse.rue}`, 70, boxY + 45);
      }
      if (user.adresse?.codePostal && user.adresse?.ville) {
        doc.text(`${user.adresse.codePostal} ${user.adresse.ville}`, 70, boxY + 60);
      }
      
      doc.text(`Email : ${user.email}`, 70, boxY + 80);
      if (user.telephone) {
        doc.text(`Téléphone : ${user.telephone}`, 70, boxY + 95);
      }

      doc.y = boxY + 140;
      doc.moveDown(1);

      // Texte d'attestation
      doc.fontSize(12)
         .font('Helvetica');
      
      const organismeNom = adhesion.organisme === 'SAR' 
        ? 'Syndicat Apicole de la Réunion (SAR)' 
        : 'Association de la Maison de l\'Apiculture de l\'Île de la Réunion (AMAIR)';
      
      doc.text(`est adhérent(e) en règle du ${organismeNom} pour l'année ${adhesion.annee}.`, {
        align: 'left',
        continued: false
      });

      doc.moveDown(1.5);

      // Informations complémentaires
      if (adhesion.napi) {
        doc.text(`Numéro NAPI : ${adhesion.napi}`);
      }
      if (adhesion.nombreRuches) {
        doc.text(`Nombre de ruches déclarées : ${adhesion.nombreRuches}`);
      }

      doc.moveDown(2);

      // Date de validation
      doc.fontSize(11)
         .font('Helvetica');
      doc.text(`Date d'adhésion : ${new Date(adhesion.dateValidation || adhesion.createdAt).toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })}`);

      doc.moveDown(3);

      // Signature et cachet
      doc.fontSize(11)
         .font('Helvetica-Oblique')
         .text('Fait à Saint-Denis, La Réunion', { align: 'right' });
      doc.text(`Le ${new Date().toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })}`, { align: 'right' });

      doc.moveDown(2);
      doc.font('Helvetica')
         .text('Le Président', { align: 'right' });

      // Pied de page
      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(
           `Document généré automatiquement le ${new Date().toLocaleDateString('fr-FR')} - Référence: ${adhesion._id}`,
           50,
           750,
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

      // En-tête avec logo/titre
      doc.fontSize(26)
         .font('Helvetica-Bold')
         .fillColor('#2563eb')
         .text(adhesion.organisme === 'SAR' ? 'SYNDICAT APICOLE DE LA RÉUNION' : 'ASSOCIATION MAISON DE L\'APICULTURE', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(12)
         .fillColor('#000000')
         .font('Helvetica')
         .text(adhesion.organisme === 'SAR' ? '(SAR)' : 'DE L\'ILE DE LA RÉUNION (AMAIR)', { align: 'center' });
      
      doc.moveDown(2);

      // Titre du document
      doc.fontSize(22)
         .font('Helvetica-Bold')
         .fillColor('#1e40af')
         .text('BULLETIN D\'ADHÉSION', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(14)
         .fillColor('#000000')
         .font('Helvetica')
         .text(`Année ${adhesion.annee}`, { align: 'center' });
      
      doc.moveDown(2);

      // Informations de l'adhérent
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#2563eb')
         .text('INFORMATIONS DE L\'ADHÉRENT');
      
      doc.moveDown(0.5);

      const user = adhesion.user;
      const boxY = doc.y;
      
      // Encadré pour les informations
      doc.rect(50, boxY, 495, 180)
         .stroke('#2563eb');
      
      doc.fontSize(12)
         .fillColor('#000000')
         .font('Helvetica');
      
      let currentY = boxY + 15;
      doc.text(`Nom : ${user.nom}`, 70, currentY);
      currentY += 20;
      doc.text(`Prénom : ${user.prenom}`, 70, currentY);
      currentY += 20;
      
      if (user.dateNaissance) {
        doc.text(`Date de naissance : ${new Date(user.dateNaissance).toLocaleDateString('fr-FR')}`, 70, currentY);
        currentY += 20;
      }
      
      if (user.adresse?.rue) {
        doc.text(`Adresse : ${user.adresse.rue}`, 70, currentY);
        currentY += 20;
      }
      if (user.adresse?.codePostal && user.adresse?.ville) {
        doc.text(`${user.adresse.codePostal} ${user.adresse.ville}`, 70, currentY);
        currentY += 20;
      }
      
      doc.text(`Email : ${user.email}`, 70, currentY);
      currentY += 20;
      
      if (user.telephone) {
        doc.text(`Téléphone : ${user.telephone}`, 70, currentY);
        currentY += 20;
      }

      doc.y = boxY + 200;
      doc.moveDown(1);

      // Informations apicoles
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#2563eb')
         .text('INFORMATIONS APICOLES');
      
      doc.moveDown(0.5);
      doc.fontSize(12)
         .fillColor('#000000')
         .font('Helvetica');

      if (adhesion.napi) {
        doc.text(`Numéro NAPI : ${adhesion.napi}`);
      }
      if (adhesion.numeroAmexa) {
        doc.text(`Numéro AMEXA : ${adhesion.numeroAmexa}`);
      }
      if (adhesion.siret) {
        doc.text(`SIRET : ${adhesion.siret}`);
      }
      if (adhesion.nombreRuches) {
        doc.text(`Nombre de ruches : ${adhesion.nombreRuches}`);
      }
      if (adhesion.nombreRuchers) {
        doc.text(`Nombre d'emplacements : ${adhesion.nombreRuchers}`);
      }
      if (adhesion.localisation?.departement) {
        doc.text(`Département : ${adhesion.localisation.departement}`);
      }
      if (adhesion.localisation?.commune) {
        doc.text(`Commune : ${adhesion.localisation.commune}`);
      }

      doc.moveDown(2);

      // Informations de cotisation
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#2563eb')
         .text('COTISATION');
      
      doc.moveDown(0.5);
      doc.fontSize(12)
         .fillColor('#000000')
         .font('Helvetica');

      doc.text(`Montant de la cotisation : ${adhesion.paiement?.montant || 0} €`);
      
      const typePaiementLabels = {
        'cheque': 'Chèque',
        'en_ligne': 'Paiement en ligne',
        'espece': 'Espèces',
        'gratuit': 'Gratuit'
      };
      doc.text(`Mode de paiement : ${typePaiementLabels[adhesion.paiement?.typePaiement] || 'Non renseigné'}`);

      doc.moveDown(2);

      // Date et signature
      doc.fontSize(11)
         .font('Helvetica-Oblique')
         .text(`Fait à Saint-Denis, La Réunion`, { align: 'left' });
      doc.text(`Le ${new Date(adhesion.createdAt).toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })}`, { align: 'left' });

      doc.moveDown(2);
      doc.font('Helvetica')
         .text('Signature de l\'adhérent :', { align: 'left' });

      // Pied de page
      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(
           `Document généré automatiquement le ${new Date().toLocaleDateString('fr-FR')} - Référence: ${adhesion._id}`,
           50,
           750,
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
 * Génère une attestation de souscription à un service
 * @param {Object} service - Le service complet (avec user)
 * @returns {Promise<Buffer>} - Le PDF en buffer
 */
const generateServiceAttestationPDF = async (service) => {
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

      // En-tête avec logo/titre
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .fillColor('#2563eb')
         .text('ASSOCIATION MAISON DE L\'APICULTURE', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(12)
         .fillColor('#000000')
         .font('Helvetica')
         .text('DE L\'ÎLE DE LA RÉUNION (AMAIR)', { align: 'center' });
      
      doc.moveDown(3);

      // Titre du document
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor('#1e40af')
         .text('ATTESTATION DE SOUSCRIPTION', { align: 'center' });
      
      doc.moveDown(0.3);
      doc.fontSize(18)
         .fillColor('#d97706')
         .text(service.nom.toUpperCase(), { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(14)
         .fillColor('#000000')
         .font('Helvetica')
         .text(`Année ${service.annee}`, { align: 'center' });
      
      doc.moveDown(3);

      // Corps de l'attestation
      doc.fontSize(12)
         .font('Helvetica');

      const user = service.user;
      const nomComplet = `${user.prenom} ${user.nom}`;
      
      doc.text('Le présent document atteste que :', { align: 'left' });
      doc.moveDown(1);

      // Informations de l'adhérent en encadré
      const boxY = doc.y;
      doc.rect(50, boxY, 495, 120)
         .stroke('#2563eb');
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text(nomComplet.toUpperCase(), 70, boxY + 20);
      
      doc.fontSize(11)
         .font('Helvetica');
      
      const infos = service.informationsPersonnelles || user;
      
      if (infos.adresse?.rue) {
        doc.text(`${infos.adresse.rue}`, 70, boxY + 45);
      }
      if (infos.adresse?.codePostal && infos.adresse?.ville) {
        doc.text(`${infos.adresse.codePostal} ${infos.adresse.ville}`, 70, boxY + 60);
      }
      
      doc.text(`Email : ${infos.email || user.email}`, 70, boxY + 80);
      if (infos.telephone || user.telephone) {
        doc.text(`Téléphone : ${infos.telephone || user.telephone}`, 70, boxY + 95);
      }

      doc.y = boxY + 140;
      doc.moveDown(1);

      // Texte d'attestation
      doc.fontSize(12)
         .font('Helvetica');
      
      doc.text(`a souscrit au service "${service.nom}" de l'Association de la Maison de l'Apiculture de l'Île de la Réunion (AMAIR) pour l'année ${service.annee}.`, {
        align: 'left',
        continued: false
      });

      doc.moveDown(1.5);

      // Informations sur le service
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .text('Détails de la souscription :');
      
      doc.moveDown(0.5);
      doc.font('Helvetica');
      doc.text(`• Droit d'usage : ${service.paiement?.montant} €`);
      doc.text(`• Caution déposée : ${service.caution?.montant} €`);
      doc.text(`• Date de validation : ${new Date(service.dateValidation || service.createdAt).toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })}`);

      doc.moveDown(2);

      // Note sur la caution
      doc.fontSize(10)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text('Note : Le chèque de caution sera conservé et restitué en fin d\'année, sauf en cas de dégradation du matériel.', {
           align: 'left'
         });

      doc.moveDown(2);

      // Signature et cachet
      doc.fontSize(11)
         .fillColor('#000000')
         .font('Helvetica-Oblique')
         .text('Fait à Saint-Denis, La Réunion', { align: 'right' });
      doc.text(`Le ${new Date().toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })}`, { align: 'right' });

      doc.moveDown(2);
      doc.font('Helvetica')
         .text('Le Président de l\'AMAIR', { align: 'right' });

      // Pied de page
      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(
           `Document généré automatiquement le ${new Date().toLocaleDateString('fr-FR')} - Référence: ${service._id}`,
           50,
           750,
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
  generateServiceAttestationPDF,
  generateAndUploadServiceAttestation
};
