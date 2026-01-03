const User = require('../models/userModel');
const Adhesion = require('../models/adhesionModel');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Générer un mot de passe aléatoire sécurisé
const generatePassword = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Configuration du transporteur email
const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Envoyer l'email d'activation
const sendActivationEmail = async (user, password) => {
  const transporter = getTransporter();
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  
  const mailOptions = {
    from: `"Abeille Réunion" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: user.email,
    subject: 'Votre compte Abeille Réunion a été créé',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f59e0b; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Abeille Réunion</h1>
        </div>
        
        <div style="padding: 30px; background-color: #f9fafb;">
          <h2 style="color: #1e293b;">Bonjour ${user.prenom} ${user.nom},</h2>
          
          <p style="color: #475569; line-height: 1.6;">
            Un compte a été créé pour vous sur la plateforme <strong>Abeille Réunion</strong> 
            à partir de votre historique d'adhésion.
          </p>
          
          <div style="background-color: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #1e293b;"><strong>Vos identifiants de connexion :</strong></p>
            <p style="margin: 5px 0; color: #475569;">Email : <strong>${user.email}</strong></p>
            <p style="margin: 5px 0; color: #475569;">Mot de passe temporaire : <strong>${password}</strong></p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" 
               style="background-color: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Se connecter
            </a>
          </div>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-weight: bold;">⚠️ Important</p>
            <p style="margin: 10px 0 0 0; color: #92400e;">
              Lors de votre première connexion, vous devrez :
            </p>
            <ul style="color: #92400e; margin: 10px 0;">
              <li>Changer votre mot de passe</li>
              <li>Accepter les conditions générales d'utilisation</li>
            </ul>
          </div>
          
          <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #991b1b; font-weight: bold;">🗓️ Délai d'activation</p>
            <p style="margin: 10px 0 0 0; color: #991b1b;">
              Si vous n'activez pas votre compte dans les <strong>2 mois</strong>, 
              celui-ci sera automatiquement supprimé ainsi que votre historique d'adhésions.
            </p>
          </div>
          
          <p style="color: #475569; font-size: 14px; margin-top: 30px;">
            Si vous n'êtes pas à l'origine de cette demande ou si vous avez des questions, 
            contactez-nous à <a href="mailto:abeillereunion@gmail.com">abeillereunion@gmail.com</a>.
          </p>
        </div>
        
        <div style="background-color: #1e293b; padding: 20px; text-align: center;">
          <p style="color: #94a3b8; margin: 0; font-size: 12px;">
            © ${new Date().getFullYear()} Abeille Réunion. Tous droits réservés.
          </p>
        </div>
      </div>
    `,
  };
  
  await transporter.sendMail(mailOptions);
};

// Envoyer l'email de rappel (7 jours avant suppression)
const sendReminderEmail = async (user) => {
  const transporter = getTransporter();
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  
  const mailOptions = {
    from: `"Abeille Réunion" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: user.email,
    subject: '⚠️ Rappel : Activez votre compte Abeille Réunion',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ef4444; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">⚠️ Rappel Important</h1>
        </div>
        
        <div style="padding: 30px; background-color: #f9fafb;">
          <h2 style="color: #1e293b;">Bonjour ${user.prenom} ${user.nom},</h2>
          
          <p style="color: #475569; line-height: 1.6;">
            Votre compte sur <strong>Abeille Réunion</strong> n'a pas encore été activé.
          </p>
          
          <div style="background-color: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; color: #991b1b; font-size: 18px; font-weight: bold;">
              🗓️ Votre compte sera supprimé dans 7 jours
            </p>
            <p style="margin: 10px 0 0 0; color: #991b1b;">
              Ainsi que tout votre historique d'adhésions.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" 
               style="background-color: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Activer mon compte maintenant
            </a>
          </div>
          
          <p style="color: #475569; font-size: 14px;">
            Si vous avez perdu vos identifiants, utilisez la fonction "Mot de passe oublié" 
            sur la page de connexion.
          </p>
        </div>
        
        <div style="background-color: #1e293b; padding: 20px; text-align: center;">
          <p style="color: #94a3b8; margin: 0; font-size: 12px;">
            © ${new Date().getFullYear()} Abeille Réunion. Tous droits réservés.
          </p>
        </div>
      </div>
    `,
  };
  
  await transporter.sendMail(mailOptions);
};

// @desc    Prévisualiser les utilisateurs à créer (dry-run)
// @route   GET /api/user-migration/preview
// @access  Super Admin
const previewUsersFromAdhesions = async (req, res) => {
  try {
    // Trouver toutes les adhésions sans compte utilisateur associé (user = null ou inexistant)
    // OU les adhésions dont l'email n'a pas de compte
    const adhesions = await Adhesion.find({}).populate('user', 'email');
    
    // Grouper les adhésions par email unique
    const emailMap = new Map();
    
    for (const adhesion of adhesions) {
      const email = adhesion.informationsPersonnelles?.email?.toLowerCase()?.trim();
      
      if (!email) continue;
      
      // Vérifier si un compte existe déjà avec cet email
      const existingUser = await User.findOne({ email });
      if (existingUser) continue;
      
      if (!emailMap.has(email)) {
        emailMap.set(email, {
          email,
          prenom: adhesion.informationsPersonnelles?.prenom,
          nom: adhesion.informationsPersonnelles?.nom,
          telephone: adhesion.informationsPersonnelles?.telephone,
          telephoneMobile: adhesion.informationsPersonnelles?.telephoneMobile,
          adresse: adhesion.informationsPersonnelles?.adresse,
          dateNaissance: adhesion.informationsPersonnelles?.dateNaissance,
          typePersonne: adhesion.informationsPersonnelles?.typePersonne,
          designation: adhesion.informationsPersonnelles?.designation,
          adhesions: [],
        });
      }
      
      emailMap.get(email).adhesions.push({
        _id: adhesion._id,
        organisme: adhesion.organisme,
        annee: adhesion.annee,
        status: adhesion.status,
      });
    }
    
    const usersToCreate = Array.from(emailMap.values());
    
    res.json({
      count: usersToCreate.length,
      users: usersToCreate,
    });
  } catch (error) {
    console.error('Erreur preview migration:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Créer les utilisateurs à partir des adhésions
// @route   POST /api/user-migration/create
// @access  Super Admin
const createUsersFromAdhesions = async (req, res) => {
  try {
    const { sendEmails = false, emails = [] } = req.body;
    
    // Si emails spécifiques fournis, ne traiter que ceux-là
    const filterEmails = emails.length > 0 ? emails.map(e => e.toLowerCase().trim()) : null;
    
    const adhesions = await Adhesion.find({}).populate('user', 'email');
    
    // Grouper les adhésions par email unique
    const emailMap = new Map();
    
    for (const adhesion of adhesions) {
      const email = adhesion.informationsPersonnelles?.email?.toLowerCase()?.trim();
      
      if (!email) continue;
      if (filterEmails && !filterEmails.includes(email)) continue;
      
      // Vérifier si un compte existe déjà avec cet email
      const existingUser = await User.findOne({ email });
      if (existingUser) continue;
      
      if (!emailMap.has(email)) {
        emailMap.set(email, {
          email,
          prenom: adhesion.informationsPersonnelles?.prenom || 'Prénom',
          nom: adhesion.informationsPersonnelles?.nom || 'Nom',
          telephone: adhesion.informationsPersonnelles?.telephone,
          telephoneMobile: adhesion.informationsPersonnelles?.telephoneMobile,
          adresse: adhesion.informationsPersonnelles?.adresse,
          dateNaissance: adhesion.informationsPersonnelles?.dateNaissance,
          typePersonne: adhesion.informationsPersonnelles?.typePersonne || 'personne_physique',
          designation: adhesion.informationsPersonnelles?.designation,
          adhesionIds: [],
          firstAdhesionId: adhesion._id,
        });
      }
      
      emailMap.get(email).adhesionIds.push(adhesion._id);
    }
    
    const results = {
      created: [],
      errors: [],
      emailsSent: [],
      emailErrors: [],
    };
    
    for (const [email, userData] of emailMap) {
      try {
        const password = generatePassword();
        
        // Créer l'utilisateur
        const user = await User.create({
          email: userData.email,
          password,
          prenom: userData.prenom,
          nom: userData.nom,
          telephone: userData.telephone,
          telephoneMobile: userData.telephoneMobile,
          adresse: userData.adresse,
          dateNaissance: userData.dateNaissance,
          typePersonne: userData.typePersonne,
          designation: userData.designation,
          role: 'user',
          roles: ['user'],
          isActive: true,
          mustChangePassword: true,
          mustAcceptTerms: true,
          createdFromAdhesion: userData.firstAdhesionId,
          activatedAt: null,
        });
        
        // Mettre à jour les adhésions pour pointer vers ce nouvel utilisateur
        await Adhesion.updateMany(
          { _id: { $in: userData.adhesionIds } },
          { $set: { user: user._id } }
        );
        
        results.created.push({
          userId: user._id,
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
          adhesionsCount: userData.adhesionIds.length,
        });
        
        // Envoyer l'email si demandé
        if (sendEmails) {
          try {
            await sendActivationEmail(user, password);
            await User.findByIdAndUpdate(user._id, {
              activationEmailSentAt: new Date(),
            });
            results.emailsSent.push(email);
          } catch (emailError) {
            console.error(`Erreur envoi email à ${email}:`, emailError);
            results.emailErrors.push({ email, error: emailError.message });
          }
        }
        
      } catch (error) {
        console.error(`Erreur création user ${email}:`, error);
        results.errors.push({ email, error: error.message });
      }
    }
    
    res.json({
      message: `${results.created.length} utilisateurs créés`,
      results,
    });
  } catch (error) {
    console.error('Erreur création users:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Renvoyer l'email d'activation à un utilisateur
// @route   POST /api/user-migration/resend-email/:userId
// @access  Super Admin
const resendActivationEmail = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    
    if (user.activatedAt) {
      return res.status(400).json({ message: 'Ce compte est déjà activé' });
    }
    
    // Générer un nouveau mot de passe
    const password = generatePassword();
    user.password = password;
    await user.save();
    
    // Envoyer l'email
    await sendActivationEmail(user, password);
    
    await User.findByIdAndUpdate(userId, {
      activationEmailSentAt: new Date(),
    });
    
    res.json({ message: 'Email d\'activation renvoyé avec succès' });
  } catch (error) {
    console.error('Erreur renvoi email:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Obtenir la liste des utilisateurs non activés
// @route   GET /api/user-migration/pending
// @access  Super Admin
const getPendingActivations = async (req, res) => {
  try {
    const users = await User.find({
      activatedAt: null,
      createdFromAdhesion: { $ne: null },
    })
      .select('email prenom nom createdAt activationEmailSentAt activationReminderSentAt')
      .sort({ createdAt: -1 });
    
    const now = new Date();
    const twoMonthsMs = 60 * 24 * 60 * 60 * 1000; // 60 jours
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    
    const usersWithStatus = users.map(user => {
      const createdAt = new Date(user.createdAt);
      const expiresAt = new Date(createdAt.getTime() + twoMonthsMs);
      const daysRemaining = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
      const needsReminder = daysRemaining <= 7 && !user.activationReminderSentAt;
      
      return {
        _id: user._id,
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        createdAt: user.createdAt,
        activationEmailSentAt: user.activationEmailSentAt,
        activationReminderSentAt: user.activationReminderSentAt,
        expiresAt,
        daysRemaining: Math.max(0, daysRemaining),
        needsReminder,
        isExpired: daysRemaining <= 0,
      };
    });
    
    res.json({
      count: usersWithStatus.length,
      users: usersWithStatus,
    });
  } catch (error) {
    console.error('Erreur récupération pending:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Envoyer les rappels aux utilisateurs à 7 jours de l'expiration
// @route   POST /api/user-migration/send-reminders
// @access  Super Admin
const sendReminders = async (req, res) => {
  try {
    const now = new Date();
    const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    
    // Trouver les utilisateurs créés il y a environ 53 jours (7 jours avant expiration)
    const reminderThreshold = new Date(now.getTime() - twoMonthsMs + sevenDaysMs);
    
    const users = await User.find({
      activatedAt: null,
      createdFromAdhesion: { $ne: null },
      activationReminderSentAt: null,
      createdAt: { $lte: reminderThreshold },
    });
    
    const results = {
      sent: [],
      errors: [],
    };
    
    for (const user of users) {
      try {
        await sendReminderEmail(user);
        await User.findByIdAndUpdate(user._id, {
          activationReminderSentAt: new Date(),
        });
        results.sent.push(user.email);
      } catch (error) {
        results.errors.push({ email: user.email, error: error.message });
      }
    }
    
    res.json({
      message: `${results.sent.length} rappels envoyés`,
      results,
    });
  } catch (error) {
    console.error('Erreur envoi rappels:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Supprimer les comptes expirés (plus de 2 mois sans activation)
// @route   DELETE /api/user-migration/cleanup-expired
// @access  Super Admin
const cleanupExpiredAccounts = async (req, res) => {
  try {
    const { dryRun = true } = req.body;
    
    const now = new Date();
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    const expiredUsers = await User.find({
      activatedAt: null,
      createdFromAdhesion: { $ne: null },
      createdAt: { $lte: twoMonthsAgo },
    });
    
    if (dryRun) {
      return res.json({
        dryRun: true,
        message: `${expiredUsers.length} comptes seraient supprimés`,
        users: expiredUsers.map(u => ({
          email: u.email,
          nom: u.nom,
          prenom: u.prenom,
          createdAt: u.createdAt,
        })),
      });
    }
    
    const results = {
      deleted: [],
      errors: [],
    };
    
    for (const user of expiredUsers) {
      try {
        // Supprimer les adhésions associées
        await Adhesion.deleteMany({ user: user._id });
        
        // Supprimer l'utilisateur
        await User.findByIdAndDelete(user._id);
        
        results.deleted.push(user.email);
      } catch (error) {
        results.errors.push({ email: user.email, error: error.message });
      }
    }
    
    res.json({
      message: `${results.deleted.length} comptes supprimés`,
      results,
    });
  } catch (error) {
    console.error('Erreur cleanup:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

module.exports = {
  previewUsersFromAdhesions,
  createUsersFromAdhesions,
  resendActivationEmail,
  getPendingActivations,
  sendReminders,
  cleanupExpiredAccounts,
};
