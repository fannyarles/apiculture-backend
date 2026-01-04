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
          'api-key': process.env.BREVO_API_KEY,
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

// Template HTML pour email de bienvenue admin
const getAdminWelcomeTemplate = (prenom, nom, email, password, organismes) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const organismesText = organismes && organismes.length > 0 
    ? organismes.join(', ') 
    : 'Aucun organisme assigné';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue - Compte Administrateur</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Bienvenue !</h1>
              <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px;">Votre compte administrateur a été créé</p>
            </td>
          </tr>
          
          <!-- Contenu -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Bonjour <strong>${prenom} ${nom}</strong>,
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Un compte administrateur a été créé pour vous sur la plateforme Abeille Réunion.
              </p>
              
              <div style="background-color: #f9fafb; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0;">
                <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #1f2937;">Vos identifiants de connexion</h2>
                
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                  <strong style="color: #374151;">Email :</strong><br>
                  <span style="font-family: monospace; font-size: 15px; color: #4f46e5;">${email}</span>
                </p>
                
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                  <strong style="color: #374151;">Mot de passe temporaire :</strong><br>
                  <span style="font-family: monospace; font-size: 15px; color: #4f46e5;">${password}</span>
                </p>
                
                <p style="margin: 15px 0 0 0; font-size: 14px; color: #6b7280;">
                  <strong style="color: #374151;">Organisme(s) assigné(s) :</strong><br>
                  <span style="font-size: 15px; color: #374151;">${organismesText}</span>
                </p>
              </div>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Pour des raisons de sécurité, nous vous recommandons fortement de <strong>changer votre mot de passe</strong> lors de votre première connexion.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${frontendUrl}/login" style="display: inline-block; padding: 14px 32px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Se connecter</a>
              </div>
              
              <p style="margin: 20px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Si vous avez des questions ou rencontrez des difficultés, n'hésitez pas à contacter le super administrateur.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
                Cet email a été envoyé automatiquement. Merci de ne pas y répondre.
                <br>
                © ${new Date().getFullYear()} Abeille Réunion - Tous droits réservés
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

// Envoyer un email de bienvenue à un nouvel administrateur
const envoyerEmailBienvenueAdmin = async (admin, passwordClair) => {
  try {
    const emailFrom = process.env.EMAIL_FROM_SAR || process.env.EMAIL_FROM_AMAIR;

    const htmlContent = getAdminWelcomeTemplate(
      admin.prenom,
      admin.nom,
      admin.email,
      passwordClair,
      admin.organismes
    );

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          email: emailFrom,
          name: 'Abeille Réunion - Administration'
        },
        to: [
          {
            email: admin.email,
            name: `${admin.prenom} ${admin.nom}`
          }
        ],
        subject: 'Bienvenue - Votre compte administrateur',
        htmlContent: htmlContent
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Email de bienvenue envoyé à ${admin.email}`);
    return { success: true, messageId: response.data.messageId };
  } catch (error) {
    console.error(`Erreur envoi email de bienvenue à ${admin.email}:`, error.response?.data || error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
};

// Envoyer un email avec pièce(s) jointe(s) (pour export UNAF)
// pieceJointe peut être un objet unique ou un tableau d'objets {content, name}
const envoyerEmailAvecPieceJointe = async (destinataire, sujet, contenuHtml, pieceJointe) => {
  try {
    const emailFrom = process.env.EMAIL_FROM_SAR;

    const payload = {
      sender: {
        email: emailFrom,
        name: 'SAR - Syndicat Apicole'
      },
      to: [
        {
          email: destinataire,
          name: 'UNAF'
        }
      ],
      subject: sujet,
      htmlContent: contenuHtml
    };

    // Ajouter la/les pièce(s) jointe(s) si présente(s)
    if (pieceJointe) {
      // Support pour tableau de pièces jointes ou pièce unique
      const piecesJointes = Array.isArray(pieceJointe) ? pieceJointe : [pieceJointe];
      payload.attachment = piecesJointes.map(pj => ({
        content: pj.content, // Base64 encoded
        name: pj.name
      }));
    }

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      payload,
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Email envoyé à ${destinataire} avec pièce jointe`);
    return { success: true, messageId: response.data.messageId };
  } catch (error) {
    console.error(`Erreur envoi email à ${destinataire}:`, error.response?.data || error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
};

// Envoyer une convocation de réunion (avec pièce jointe optionnelle)
const envoyerConvocation = async (destinataires, convocation, organisme, pdfAttachment = null) => {
  const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE) || 10;
  const BATCH_DELAY = parseInt(process.env.EMAIL_BATCH_DELAY_MS) || 1000;

  let emailsEnvoyes = 0;
  let emailsEchoues = 0;
  const erreurs = [];

  const emailFrom = organisme === 'SAR' 
    ? process.env.EMAIL_FROM_SAR 
    : process.env.EMAIL_FROM_AMAIR;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const htmlContent = getEmailTemplate(convocation.contenu, organisme, frontendUrl);

  console.log(`📧 Convocation "${convocation.objet}" - Envoi à ${destinataires.length} membres${pdfAttachment ? ' (avec PJ)' : ''}`);

  for (let i = 0; i < destinataires.length; i += BATCH_SIZE) {
    const batch = destinataires.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (destinataire) => {
        const emailData = {
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
          subject: convocation.objet,
          htmlContent: htmlContent
        };

        // Ajouter la pièce jointe si présente
        if (pdfAttachment && pdfAttachment.url) {
          emailData.attachment = [
            {
              url: pdfAttachment.url,
              name: pdfAttachment.name || 'convocation.pdf'
            }
          ];
        }

        const response = await axios.post(
          'https://api.brevo.com/v3/smtp/email',
          emailData,
          {
            headers: {
              'api-key': process.env.BREVO_API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );
        return response;
      })
    );

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

    if (i + BATCH_SIZE < destinataires.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  console.log(`🎉 Convocation envoyée : ${emailsEnvoyes}/${destinataires.length} emails`);

  return {
    emailsEnvoyes,
    emailsEchoues,
    erreurs
  };
};

// Fonction générique pour envoyer un email simple (to, subject, html)
const sendEmail = async ({ to, subject, html }) => {
  try {
    const emailFrom = process.env.EMAIL_FROM_SAR || process.env.EMAIL_FROM_AMAIR;

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          email: emailFrom,
          name: 'Syndicat Apicole de La Réunion'
        },
        to: [
          {
            email: to
          }
        ],
        subject: subject,
        htmlContent: html
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Email envoyé à ${to} (messageId: ${response.data.messageId})`);
    console.log(`   Expéditeur: ${emailFrom}`);
    return { success: true, messageId: response.data.messageId };
  } catch (error) {
    console.error(`Erreur envoi email à ${to}:`, error.response?.data || error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
};

module.exports = sendEmail;

// Exporter aussi les autres fonctions pour rétrocompatibilité
module.exports.envoyerEmail = envoyerEmail;
module.exports.envoyerCommunication = envoyerCommunication;
module.exports.getEmailTemplate = getEmailTemplate;
module.exports.envoyerEmailBienvenueAdmin = envoyerEmailBienvenueAdmin;
module.exports.envoyerEmailAvecPieceJointe = envoyerEmailAvecPieceJointe;
module.exports.envoyerConvocation = envoyerConvocation;
module.exports.sendEmail = sendEmail;
