const axios = require('axios');

// Template HTML pour les communications
const getEmailTemplate = (contenu, organisme, frontendUrl) => {
  const headerImage = organisme === 'SAR' 
    ? `${process.env.BACKEND_URL || 'http://localhost:5000'}/uploads/communications/headers/header-sar.png`
    : `${process.env.BACKEND_URL || 'http://localhost:5000'}/uploads/communications/headers/header-amair.png`;

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Communication</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          
          <!-- Header avec image -->
          <tr>
            <td style="padding: 0;">
              <img src="${headerImage}" alt="Header ${organisme}" style="width: 100%; height: auto; display: block;" />
            </td>
          </tr>
          
          <!-- Contenu -->
          <tr>
            <td style="padding: 40px 30px;">
              ${contenu}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
                Vous recevez cet email car vous êtes adhérent actif.
                <br>
                Vous pouvez gérer vos préférences de communication dans 
                <a href="${frontendUrl}/parametres" style="color: #4F46E5; text-decoration: none;">votre compte</a>.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// Envoyer un email via Brevo
const envoyerEmail = async (destinataire, communication, organisme) => {
  try {
    const emailFrom = organisme === 'SAR' 
      ? process.env.EMAIL_FROM_SAR 
      : process.env.EMAIL_FROM_AMAIR;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const htmlContent = getEmailTemplate(
      communication.contenu,
      organisme,
      frontendUrl
    );

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          email: emailFrom,
          name: organisme === 'SAR' ? 'SAR - Syndicat Apicole' : 'AMAIR - Association Apicole'
        },
        to: [
          {
            email: destinataire.email,
            name: `${destinataire.prenom} ${destinataire.nom}`
          }
        ],
        subject: communication.titre,
        htmlContent: htmlContent
      },
      {
        headers: {
          'api-key': process.env.SMTP_PASS,
          'Content-Type': 'application/json'
        }
      }
    );

    return { success: true, messageId: response.data.messageId };
  } catch (error) {
    console.error(`Erreur envoi email à ${destinataire.email}:`, error.response?.data || error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
};

// Envoyer une communication à tous les destinataires
const envoyerCommunication = async (communication, destinataires) => {
  const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE) || 10;
  const BATCH_DELAY = parseInt(process.env.EMAIL_BATCH_DELAY_MS) || 1000;

  let emailsEnvoyes = 0;
  let emailsEchoues = 0;
  const erreurs = [];

  console.log(`📧 Communication "${communication.titre}" - Envoi à ${destinataires.length} adhérents`);

  // Découper en batchs
  for (let i = 0; i < destinataires.length; i += BATCH_SIZE) {
    const batch = destinataires.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatchs = Math.ceil(destinataires.length / BATCH_SIZE);

    console.log(`📧 Batch ${batchNum}/${totalBatchs} : Envoi de ${batch.length} emails...`);

    // Envoyer tous les emails du batch en parallèle
    const results = await Promise.allSettled(
      batch.map(user => envoyerEmail(user, communication, communication.organisme))
    );

    // Compter succès/échecs
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        emailsEnvoyes++;
      } else {
        emailsEchoues++;
        erreurs.push({
          email: batch[index].email,
          erreur: result.reason.message,
          date: new Date()
        });
      }
    });

    console.log(`   ✅ ${emailsEnvoyes} succès, ❌ ${emailsEchoues} échecs`);

    // Pause entre les batchs (sauf pour le dernier)
    if (i + BATCH_SIZE < destinataires.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  console.log(`🎉 Envoi terminé : ${emailsEnvoyes}/${destinataires.length} emails envoyés`);

  return {
    emailsEnvoyes,
    emailsEchoues,
    erreurs: erreurs.slice(-10) // Garder les 10 dernières erreurs
  };
};

module.exports = {
  envoyerEmail,
  envoyerCommunication,
  getEmailTemplate
};
