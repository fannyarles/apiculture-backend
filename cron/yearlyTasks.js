const cron = require('node-cron');
const Parametre = require('../models/parametreModel');
const Adhesion = require('../models/adhesionModel');
const Article = require('../models/articleModel');
const Communication = require('../models/communicationModel');
const { getDestinataires } = require('../controllers/communicationController');
const { envoyerCommunication } = require('../services/emailService');
const { generateUNAFExcel, isExportDate, EXPORT_DATES_2026 } = require('../services/unafExportService');

/**
 * Cron job qui s'exécute le 31 décembre à 23:59
 * Crée les paramètres pour la nouvelle année N+1
 */
const initNouvelleAnneeCron = () => {
  // Cron expression: '59 23 31 12 *' = à 23:59 le 31 décembre
  cron.schedule('59 23 31 12 *', async () => {
    try {
      console.log('🔄 Cron: Initialisation de la nouvelle année...');
      
      const nextYear = new Date().getFullYear() + 1;

      // Récupérer les tarifs de l'année en cours
      const currentYear = new Date().getFullYear();
      const currentSAR = await Parametre.findOne({ organisme: 'SAR', annee: currentYear });
      const currentAMAIR = await Parametre.findOne({ organisme: 'AMAIR', annee: currentYear });

      // Fermer les adhésions de l'année qui se termine
      await Parametre.updateMany(
        { annee: currentYear },
        { adhesionsOuvertes: false }
      );
      console.log(`🔒 Adhésions fermées pour l'année ${currentYear}`);

      // Vérifier si les paramètres existent déjà
      const existingSAR = await Parametre.findOne({ organisme: 'SAR', annee: nextYear });
      const existingAMAIR = await Parametre.findOne({ organisme: 'AMAIR', annee: nextYear });

      const created = [];

      // Créer SAR si n'existe pas
      if (!existingSAR) {
        const sarParametre = await Parametre.create({
          organisme: 'SAR',
          annee: nextYear,
          tarifs: currentSAR ? currentSAR.tarifs.SAR : null,
          adhesionsOuvertes: false, // Fermées par défaut
          estAnneeEnCours: false
        });
        created.push(sarParametre);
        console.log(`✅ Paramètres SAR ${nextYear} créés`);
      }

      // Créer AMAIR si n'existe pas
      if (!existingAMAIR) {
        const amairParametre = await Parametre.create({
          organisme: 'AMAIR',
          annee: nextYear,
          tarifs: currentAMAIR ? currentAMAIR.tarifs.SAR : null,
          adhesionsOuvertes: false, // Fermées par défaut
          estAnneeEnCours: false
        });
        created.push(amairParametre);
        console.log(`✅ Paramètres AMAIR ${nextYear} créés`);
      }

      if (created.length > 0) {
        console.log(`🎉 Paramètres pour l'année ${nextYear} créés avec succès`);
      } else {
        console.log(`ℹ️ Les paramètres pour l'année ${nextYear} existent déjà`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation de la nouvelle année:', error);
    }
  });

  console.log('📅 Cron job configuré: Initialisation nouvelle année (31 décembre à 23:59)');
};

/**
 * Fonction pour expirer les adhésions de l'année précédente
 * Passe toutes les adhésions actives de l'année N-1 en statut 'expiree'
 */
const expireAdhesionsAnneePrecedente = async () => {
  try {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    console.log(`🔄 Expiration des adhésions de l'année ${previousYear}...`);

    // Trouver et mettre à jour toutes les adhésions actives de l'année précédente
    const result = await Adhesion.updateMany(
      {
        annee: previousYear,
        status: { $in: ['actif', 'en_attente', 'paiement_demande'] }
      },
      {
        $set: {
          status: 'expiree',
          dateExpiration: new Date()
        }
      }
    );

    console.log(`✅ ${result.modifiedCount} adhésion(s) de ${previousYear} passée(s) en statut 'expirée'`);
    return result.modifiedCount;
  } catch (error) {
    console.error('❌ Erreur lors de l\'expiration des adhésions:', error);
    throw error;
  }
};

/**
 * Cron job qui s'exécute le 1er janvier à 00:00
 * Expire toutes les adhésions de l'année précédente
 */
const expireAdhesionsCron = () => {
  // Cron expression: '0 0 1 1 *' = à 00:00 le 1er janvier
  cron.schedule('0 0 1 1 *', async () => {
    console.log('📅 Cron: Expiration des adhésions (1er janvier minuit)...');
    await expireAdhesionsAnneePrecedente();
  });

  // Cron expression: '55 1 3 1 *' = à 01:55 le 3 janvier (backup/vérification)
  cron.schedule('55 1 3 1 *', async () => {
    console.log('📅 Cron: Vérification expiration des adhésions (3 janvier 01:55)...');
    await expireAdhesionsAnneePrecedente();
  });

  console.log('📅 Cron job configuré: Expiration des adhésions (1er janvier 00:00 + 3 janvier 01:55)');
};

/**
 * Cron job qui s'exécute le 1er janvier à 00:01
 * Met à jour le flag estAnneeEnCours pour la nouvelle année
 */
const updateAnneeEnCoursCron = () => {
  // Cron expression: '1 0 1 1 *' = à 00:01 le 1er janvier
  cron.schedule('1 0 1 1 *', async () => {
    try {
      console.log('🔄 Cron: Mise à jour de l\'année en cours...');
      
      const currentYear = new Date().getFullYear();

      // Mettre à jour l'année en cours
      await Parametre.updateMany(
        { annee: currentYear },
        { estAnneeEnCours: true, adhesionsOuvertes: true }
      );

      // Mettre à jour les autres années
      await Parametre.updateMany(
        { annee: { $ne: currentYear } },
        { estAnneeEnCours: false }
      );

      console.log(`🎉 Année en cours mise à jour: ${currentYear}`);
      console.log(`✅ Adhésions ouvertes pour ${currentYear}`);
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de l\'année en cours:', error);
    }
  });

  console.log('📅 Cron job configuré: Mise à jour année en cours (1er janvier à 00:01)');
};

/**
 * Cron job qui s'exécute toutes les minutes
 * Publie automatiquement les articles programmés dont la date est atteinte
 */
const publishScheduledArticlesCron = () => {
  // Cron expression: '* * * * *' = toutes les minutes
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      console.log(`🔍 Cron: Vérification des articles programmés (${now.toLocaleString('fr-FR')})`);
      
      // Trouver les articles programmés dont la date de publication est passée
      const articlesToPublish = await Article.find({
        statut: 'programme',
        datePublication: { $lte: now }
      });

      console.log(`📊 Articles programmés trouvés: ${articlesToPublish.length}`);

      if (articlesToPublish.length > 0) {
        console.log(`📰 Cron: ${articlesToPublish.length} article(s) à publier...`);

        // Publier chaque article
        for (const article of articlesToPublish) {
          console.log(`   → Publication de "${article.titre}" (date: ${article.datePublication})`);
          article.statut = 'publie';
          await article.save();
          console.log(`   ✅ Article publié: "${article.titre}"`);
        }

        console.log(`🎉 ${articlesToPublish.length} article(s) publié(s) automatiquement`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la publication automatique des articles:', error);
      console.error('   Détails:', error.message);
      console.error('   Stack:', error.stack);
    }
  });

  console.log('📅 Cron job configuré: Publication automatique des articles (toutes les minutes)');
};

/**
 * Cron job qui s'exécute toutes les minutes
 * Envoie automatiquement les communications programmées dont la date est atteinte
 */
const sendScheduledCommunicationsCron = () => {
  // Cron expression: '* * * * *' = toutes les minutes
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      console.log(`🔍 Cron: Vérification des communications programmées (${now.toLocaleString('fr-FR')})`);
      
      // Trouver les communications programmées dont la date est atteinte
      const communicationsToSend = await Communication.find({
        statut: 'programme',
        dateProgrammee: { $lte: now }
      });

      console.log(`📊 Communications programmées trouvées: ${communicationsToSend.length}`);

      if (communicationsToSend.length > 0) {
        console.log(`📧 Cron: ${communicationsToSend.length} communication(s) à envoyer...`);

        // Envoyer chaque communication
        for (const communication of communicationsToSend) {
          console.log(`   → Envoi de "${communication.titre}"`);
          
          try {
            // Récupérer les destinataires
            const destinataires = await getDestinataires(communication);
            
            if (destinataires.length === 0) {
              console.log(`   ⚠️  Aucun destinataire pour "${communication.titre}"`);
              continue;
            }

            // Envoyer les emails
            const { emailsEnvoyes, emailsEchoues, erreurs } = await envoyerCommunication(
              communication,
              destinataires
            );

            // Mettre à jour la communication
            communication.statut = 'envoye';
            communication.dateEnvoi = new Date();
            communication.emailsEnvoyes = emailsEnvoyes;
            communication.emailsEchoues = emailsEchoues;
            communication.erreurs = erreurs;
            await communication.save();

            console.log(`   ✅ Communication envoyée: "${communication.titre}" (${emailsEnvoyes}/${destinataires.length})`);
          } catch (error) {
            console.error(`   ❌ Erreur lors de l'envoi de "${communication.titre}":`, error.message);
          }
        }

        console.log(`🎉 ${communicationsToSend.length} communication(s) envoyée(s) automatiquement`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi automatique des communications:', error);
      console.error('   Détails:', error.message);
      console.error('   Stack:', error.stack);
    }
  });

  console.log('📅 Cron job configuré: Envoi automatique des communications (toutes les minutes)');
};

/**
 * Cron job qui s'exécute tous les jours à 8h00
 * Génère automatiquement les exports UNAF aux dates définies
 */
const generateUNAFExportCron = () => {
  // Cron expression: '0 8 * * *' = à 8h00 tous les jours
  cron.schedule('0 8 * * *', async () => {
    try {
      const today = new Date();
      const annee = today.getFullYear();
      
      console.log(`🔍 Cron: Vérification export UNAF (${today.toLocaleDateString('fr-FR')})`);
      
      // Vérifier si aujourd'hui est une date d'export
      if (isExportDate(today, annee)) {
        console.log(`📊 Cron: C'est une date d'export UNAF, génération en cours...`);
        
        const result = await generateUNAFExcel(annee, today);
        
        if (result.success) {
          console.log(`✅ Export UNAF généré: ${result.nombrePaiements} paiements, ${result.montantTotal}€`);
        } else {
          console.log(`ℹ️ Export UNAF: ${result.message}`);
        }
      } else {
        console.log(`ℹ️ Pas de date d'export UNAF aujourd'hui`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la génération de l\'export UNAF:', error);
      console.error('   Détails:', error.message);
    }
  });

  // Afficher les prochaines dates d'export
  const today = new Date();
  const nextDates = EXPORT_DATES_2026.filter(d => d > today).slice(0, 3);
  console.log('📅 Cron job configuré: Export UNAF automatique (8h00 aux dates définies)');
  if (nextDates.length > 0) {
    console.log(`   Prochains exports: ${nextDates.map(d => d.toLocaleDateString('fr-FR')).join(', ')}`);
  }
};

/**
 * Initialiser tous les cron jobs
 */
const initCronJobs = () => {
  initNouvelleAnneeCron();
  expireAdhesionsCron();
  updateAnneeEnCoursCron();
  publishScheduledArticlesCron();
  sendScheduledCommunicationsCron();
  generateUNAFExportCron();
  console.log('✅ Tous les cron jobs sont configurés');
};

module.exports = {
  initCronJobs
};
