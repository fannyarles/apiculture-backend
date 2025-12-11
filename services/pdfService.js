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

module.exports = {
  generateAdhesionPDF,
  generateAndUploadAdhesionPDF
};
