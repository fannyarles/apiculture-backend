const User = require('../models/userModel');
const NotificationSettings = require('../models/notificationSettingsModel');
const nodemailer = require('nodemailer');

// Configuration du transporteur SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Récupère les admins à notifier pour un organisme et un type de notification donnés
 * @param {string} organisme - L'organisme concerné (SAR, AMAIR)
 * @param {string} notificationType - Le type de notification (suiviAdhesions)
 * @returns {Array} Liste des admins à notifier avec leur email
 */
const getAdminsToNotify = async (organisme, notificationType) => {
  try {
    // Récupérer tous les admins rattachés à cet organisme
    const admins = await User.find({
      role: { $in: ['admin', 'super_admin'] },
      organismes: organisme,
      isActive: true,
    });

    const adminsToNotify = [];

    for (const admin of admins) {
      const settings = await NotificationSettings.findOne({ userId: admin._id });
      
      if (settings) {
        // Vérifier si la notification est activée
        if (notificationType === 'suiviAdhesions' && settings.adhesions?.suiviAdhesions) {
          adminsToNotify.push(admin);
        }
      }
    }

    return adminsToNotify;
  } catch (error) {
    console.error('Erreur lors de la récupération des admins à notifier:', error);
    return [];
  }
};

/**
 * Envoie une notification par email aux admins concernés lors d'une nouvelle adhésion
 * @param {Object} adhesion - L'adhésion créée (avec user populé)
 */
const notifyAdminsNewAdhesion = async (adhesion) => {
  try {
    const adminsToNotify = await getAdminsToNotify(adhesion.organisme, 'suiviAdhesions');
    
    if (adminsToNotify.length === 0) {
      console.log(`📧 Aucun admin à notifier pour la nouvelle adhésion ${adhesion._id}`);
      return;
    }

    const userName = adhesion.user ? `${adhesion.user.prenom} ${adhesion.user.nom}` : 'Utilisateur';
    const userEmail = adhesion.user?.email || 'Non renseigné';

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">📋 Nouvelle demande d'adhésion</h2>
        
        <p>Une nouvelle demande d'adhésion a été soumise :</p>
        
        <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Adhérent :</strong> ${userName}</p>
          <p style="margin: 5px 0;"><strong>Email :</strong> ${userEmail}</p>
          <p style="margin: 5px 0;"><strong>Organisme :</strong> ${adhesion.organisme}</p>
          <p style="margin: 5px 0;"><strong>Année :</strong> ${adhesion.annee}</p>
          <p style="margin: 5px 0;"><strong>Nombre de ruches :</strong> ${adhesion.nombreRuches || 'N/A'}</p>
          <p style="margin: 5px 0;"><strong>Montant :</strong> ${adhesion.paiement?.montant?.toFixed(2) || '0.00'} €</p>
          <p style="margin: 5px 0;"><strong>Statut paiement :</strong> ${adhesion.paiement?.status === 'paye' ? '✅ Payé' : '⏳ En attente'}</p>
        </div>
        
        <p>Connectez-vous à l'espace administrateur pour consulter les détails.</p>
        
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
        
        <p style="color: #6B7280; font-size: 12px;">
          Cette notification vous est envoyée car vous avez activé le suivi des adhésions pour ${adhesion.organisme}.
        </p>
      </div>
    `;

    // Envoyer à chaque admin
    for (const admin of adminsToNotify) {
      try {
        await transporter.sendMail({
          from: `"${process.env.PLATFORM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
          to: admin.email,
          subject: `[${adhesion.organisme}] Nouvelle demande d'adhésion - ${userName}`,
          html: emailContent,
        });
        console.log(`📧 Notification nouvelle adhésion envoyée à ${admin.email}`);
      } catch (emailError) {
        console.error(`Erreur envoi notification à ${admin.email}:`, emailError.message);
      }
    }
  } catch (error) {
    console.error('Erreur lors de la notification des admins (nouvelle adhésion):', error);
  }
};

/**
 * Envoie une notification par email aux admins concernés lors d'un paiement d'adhésion
 * @param {Object} adhesion - L'adhésion payée (avec user populé)
 */
const notifyAdminsAdhesionPayment = async (adhesion) => {
  try {
    const adminsToNotify = await getAdminsToNotify(adhesion.organisme, 'suiviAdhesions');
    
    if (adminsToNotify.length === 0) {
      console.log(`📧 Aucun admin à notifier pour le paiement de l'adhésion ${adhesion._id}`);
      return;
    }

    const userName = adhesion.user ? `${adhesion.user.prenom} ${adhesion.user.nom}` : 'Utilisateur';

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16A34A;">💰 Paiement d'adhésion reçu</h2>
        
        <p>Un paiement d'adhésion a été reçu :</p>
        
        <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Adhérent :</strong> ${userName}</p>
          <p style="margin: 5px 0;"><strong>Organisme :</strong> ${adhesion.organisme}</p>
          <p style="margin: 5px 0;"><strong>Année :</strong> ${adhesion.annee}</p>
          <p style="margin: 5px 0;"><strong>Montant :</strong> ${adhesion.paiement?.montant?.toFixed(2) || '0.00'} €</p>
          <p style="margin: 5px 0;"><strong>Date de paiement :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
        </div>
        
        <p>L'adhésion est maintenant <strong style="color: #16A34A;">active</strong>.</p>
        
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
        
        <p style="color: #6B7280; font-size: 12px;">
          Cette notification vous est envoyée car vous avez activé le suivi des adhésions pour ${adhesion.organisme}.
        </p>
      </div>
    `;

    // Envoyer à chaque admin
    for (const admin of adminsToNotify) {
      try {
        await transporter.sendMail({
          from: `"${process.env.PLATFORM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
          to: admin.email,
          subject: `[${adhesion.organisme}] Paiement reçu - Adhésion ${userName}`,
          html: emailContent,
        });
        console.log(`📧 Notification paiement adhésion envoyée à ${admin.email}`);
      } catch (emailError) {
        console.error(`Erreur envoi notification à ${admin.email}:`, emailError.message);
      }
    }
  } catch (error) {
    console.error('Erreur lors de la notification des admins (paiement adhésion):', error);
  }
};

/**
 * Envoie une notification par email aux admins concernés lors d'un paiement de service
 * @param {Object} service - Le service payé (avec user populé)
 */
const notifyAdminsServicePayment = async (service) => {
  try {
    // Déterminer l'organisme en fonction du type de service
    // Service UNAF = SAR, Service Miellerie = AMAIR
    const organisme = service.organisme;
    
    const adminsToNotify = await getAdminsToNotify(organisme, 'suiviAdhesions');
    
    if (adminsToNotify.length === 0) {
      console.log(`📧 Aucun admin à notifier pour le paiement du service ${service._id}`);
      return;
    }

    const userName = service.user ? `${service.user.prenom} ${service.user.nom}` : 'Utilisateur';
    const serviceName = service.typeService === 'assurance_unaf' ? 'Services de l\'UNAF' : 'Miellerie AMAIR';

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16A34A;">💰 Paiement de service reçu</h2>
        
        <p>Un paiement de service a été reçu :</p>
        
        <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Adhérent :</strong> ${userName}</p>
          <p style="margin: 5px 0;"><strong>Service :</strong> ${serviceName}</p>
          <p style="margin: 5px 0;"><strong>Organisme :</strong> ${organisme}</p>
          <p style="margin: 5px 0;"><strong>Année :</strong> ${service.annee}</p>
          <p style="margin: 5px 0;"><strong>Montant :</strong> ${service.paiement?.montant?.toFixed(2) || '0.00'} €</p>
          <p style="margin: 5px 0;"><strong>Date de paiement :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
          ${service.typeService === 'assurance_unaf' ? `<p style="margin: 5px 0;"><strong>Nombre de ruches :</strong> ${service.unafData?.nombreRuches || 'N/A'}</p>` : ''}
        </div>
        
        <p>Le service est maintenant <strong style="color: #16A34A;">actif</strong>.</p>
        
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
        
        <p style="color: #6B7280; font-size: 12px;">
          Cette notification vous est envoyée car vous avez activé le suivi des adhésions pour ${organisme}.
        </p>
      </div>
    `;

    // Envoyer à chaque admin
    for (const admin of adminsToNotify) {
      try {
        await transporter.sendMail({
          from: `"${process.env.PLATFORM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
          to: admin.email,
          subject: `[${organisme}] Paiement reçu - ${serviceName} - ${userName}`,
          html: emailContent,
        });
        console.log(`📧 Notification paiement service envoyée à ${admin.email}`);
      } catch (emailError) {
        console.error(`Erreur envoi notification à ${admin.email}:`, emailError.message);
      }
    }
  } catch (error) {
    console.error('Erreur lors de la notification des admins (paiement service):', error);
  }
};

module.exports = {
  getAdminsToNotify,
  notifyAdminsNewAdhesion,
  notifyAdminsAdhesionPayment,
  notifyAdminsServicePayment,
};
