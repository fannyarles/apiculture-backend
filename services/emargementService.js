const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const MembreConseil = require('../models/membreConseilModel');
const { uploadFile } = require('./s3Service');

// Chemins des logos
const LOGOS = {
  SAR: path.join(__dirname, '../uploads/logos/logo_sar.png'),
  AMAIR: path.join(__dirname, '../uploads/logos/logo_amair.png'),
};

// Labels des fonctions
const FONCTION_LABELS = {
  president: 'Président',
  vice_president: 'Vice-président',
  secretaire: 'Secrétaire',
  secretaire_adjoint: 'Secrétaire-adjoint',
  tresorier: 'Trésorier',
  tresorier_adjoint: 'Trésorier-adjoint',
};

/**
 * Génère une feuille d'émargement PDF pour une réunion
 * @param {Object} reunion - L'objet réunion
 * @returns {Promise<Buffer>} - Le buffer du PDF
 */
const generateEmargementPDF = async (reunion) => {
  // Récupérer les membres selon le type de réunion
  let membres = [];
  
  if (reunion.type === 'assemblee_generale') {
    // AG : membres du bureau
    membres = await MembreConseil.find({
      organisme: reunion.organisme,
      estBureau: true,
      actif: true,
    }).populate('adherent', 'nom prenom email');
  } else if (reunion.type === 'conseil_syndical') {
    // Conseil : membres du conseil
    membres = await MembreConseil.find({
      organisme: reunion.organisme,
      estConseil: true,
      actif: true,
    }).populate('adherent', 'nom prenom email');
  }

  // Trier les membres : bureau d'abord (par fonction), puis les autres
  membres.sort((a, b) => {
    const fonctionOrder = ['president', 'vice_president', 'secretaire', 'secretaire_adjoint', 'tresorier', 'tresorier_adjoint'];
    
    if (a.estBureau && b.estBureau) {
      return fonctionOrder.indexOf(a.fonction) - fonctionOrder.indexOf(b.fonction);
    }
    if (a.estBureau) return -1;
    if (b.estBureau) return 1;
    
    // Trier par nom
    const nomA = a.adherent?.nom || '';
    const nomB = b.adherent?.nom || '';
    return nomA.localeCompare(nomB);
  });

  // Créer le PDF
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Logo de l'organisme à gauche + en-tête à droite
    const logoPath = LOGOS[reunion.organisme];
    const logoWidth = 80;
    const logoX = 50;
    const logoY = 40;
    const textX = logoX + logoWidth + 20;
    const textWidth = doc.page.width - textX - 50;
    
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { width: logoWidth });
    }

    // En-tête avec titre (à droite du logo)
    const organismeNom = reunion.organisme === 'SAR' 
      ? 'SYNDICAT APICOLE DE LA RÉUNION'
      : 'ASSOCIATION DE LA MAISON DE L\'APICULTURE DE LA RÉUNION';
    
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#E98E09')
       .text(organismeNom, textX, logoY + 15, { width: textWidth, align: 'left' });

    // Titre du document (à droite du logo)
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text("FEUILLE D'ÉMARGEMENT", textX, logoY + 40, { width: textWidth, align: 'left' });
    
    // Type de réunion
    const typeLabel = reunion.type === 'assemblee_generale' 
      ? 'Assemblée Générale' 
      : 'Conseil d\'Administration';
    doc.fontSize(14)
       .font('Helvetica')
       .fillColor('#000000')
       .text(typeLabel, textX, logoY + 65, { width: textWidth, align: 'left' });
    
    // Repositionner le curseur après l'en-tête
    doc.y = logoY + logoWidth + 40;
    doc.x = 50;
    
    doc.moveDown(1);

    // Informations de la réunion - tableau sans bordure
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor('#E98E09')
       .text('INFORMATIONS DE LA RÉUNION');
    
    doc.moveDown(0.5);
    
    const dateFormatted = new Date(reunion.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    
    // Formater le range horaire
    let heureRange = '-';
    if (reunion.heureDebut && reunion.heureFin) {
      heureRange = `${reunion.heureDebut} - ${reunion.heureFin}`;
    } else if (reunion.heureDebut) {
      heureRange = reunion.heureDebut;
    } else if (reunion.heureFin) {
      heureRange = `jusqu'à ${reunion.heureFin}`;
    }
    
    const infoTableLeft = 50;
    const infoColWidth = 165;
    const infoLabelSize = 9;
    const infoValueSize = 11;
    const infoRowHeight = 28;
    
    let infoY = doc.y;
    
    // Ligne : Date | Horaire | Lieu
    doc.fontSize(infoLabelSize).fillColor('#747474').font('Helvetica');
    doc.text('DATE', infoTableLeft, infoY);
    doc.text('HORAIRE', infoTableLeft + infoColWidth, infoY);
    doc.text('LIEU', infoTableLeft + infoColWidth * 2, infoY);
    
    doc.fontSize(infoValueSize).fillColor('#000000');
    doc.text(dateFormatted, infoTableLeft, infoY + 10);
    doc.text(heureRange, infoTableLeft + infoColWidth, infoY + 10);
    doc.text(reunion.lieu || '-', infoTableLeft + infoColWidth * 2, infoY + 10);
    
    infoY += infoRowHeight;
    doc.y = infoY;
    doc.moveDown(1);

    // Tableau d'émargement
    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [180, 150, 165]; // Nom, Fonction, Signature
    const rowHeight = 35;
    const headerHeight = 25;

    // En-tête du tableau avec fond orange
    doc.rect(tableLeft, tableTop, colWidths[0] + colWidths[1] + colWidths[2], headerHeight).fill('#E98E09');

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text('Nom et Prénom', tableLeft + 5, tableTop + 8, { width: colWidths[0] - 10 });
    doc.text('Fonction', tableLeft + colWidths[0] + 5, tableTop + 8, { width: colWidths[1] - 10 });
    doc.text('Signature', tableLeft + colWidths[0] + colWidths[1] + 5, tableTop + 8, { width: colWidths[2] - 10 });

    // Lignes du tableau
    let currentY = tableTop + headerHeight;
    doc.font('Helvetica').fontSize(10).fillColor('#000000');

    for (const membre of membres) {
      // Vérifier s'il faut une nouvelle page
      if (currentY + rowHeight > doc.page.height - 80) {
        doc.addPage();
        currentY = 50;
      }

      const nom = membre.adherent ? `${membre.adherent.nom} ${membre.adherent.prenom}` : 'Membre inconnu';
      const fonction = membre.estBureau && membre.fonction 
        ? FONCTION_LABELS[membre.fonction] || membre.fonction
        : (membre.estCoopte ? 'Membre coopté' : 'Membre');

      // Dessiner les cellules
      doc.rect(tableLeft, currentY, colWidths[0], rowHeight).stroke();
      doc.rect(tableLeft + colWidths[0], currentY, colWidths[1], rowHeight).stroke();
      doc.rect(tableLeft + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight).stroke();

      // Contenu
      doc.text(nom, tableLeft + 5, currentY + 12, { width: colWidths[0] - 10 });
      doc.text(fonction, tableLeft + colWidths[0] + 5, currentY + 12, { width: colWidths[1] - 10 });
      // Colonne signature vide

      currentY += rowHeight;
    }

    // Ajouter des lignes vides pour d'éventuels invités
    const lignesVides = Math.max(0, 5 - membres.length);
    for (let i = 0; i < lignesVides; i++) {
      if (currentY + rowHeight > doc.page.height - 80) {
        doc.addPage();
        currentY = 50;
      }

      doc.rect(tableLeft, currentY, colWidths[0], rowHeight).stroke();
      doc.rect(tableLeft + colWidths[0], currentY, colWidths[1], rowHeight).stroke();
      doc.rect(tableLeft + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight).stroke();

      currentY += rowHeight;
    }

  // Pied de page
  doc.fontSize(8)
      .font('Helvetica-Oblique')
      .fillColor('#666666')
      doc.text(`Document généré le ${new Date().toLocaleDateString('fr-FR')}`,
        50,
        doc.page.height - 60,
        { align: 'center', width: 495 }
      );

    doc.end();
  });
};

/**
 * Génère et uploade la feuille d'émargement vers S3
 * @param {Object} reunion - L'objet réunion
 * @returns {Promise<Object>} - Les informations du fichier uploadé
 */
const generateAndUploadEmargement = async (reunion) => {
  // Générer le PDF
  const pdfBuffer = await generateEmargementPDF(reunion);

  // Nom du fichier
  const dateStr = new Date(reunion.date).toISOString().split('T')[0];
  const typeStr = reunion.type === 'assemblee_generale' ? 'AG' : 'CA';
  const fileName = `Emargement_${typeStr}_${reunion.organisme}_${dateStr}.pdf`;

  // Upload vers S3
  const uploadResult = await uploadFile(
    pdfBuffer,
    fileName,
    'application/pdf',
    `reunions/${reunion._id}`
  );

  return {
    nom: "Feuille d'émargement",
    nomOriginal: fileName,
    key: uploadResult.key,
    url: uploadResult.url,
    type: 'application/pdf',
    taille: pdfBuffer.length,
    dateAjout: new Date(),
    isEmargement: true, // Marqueur spécial
  };
};

module.exports = {
  generateEmargementPDF,
  generateAndUploadEmargement,
};
