const mongoose = require('mongoose');

const permissionSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    // Module Adhésions
    adhesions: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès au module adhérents (consultation)',
      },
      sendPaymentLink: {
        type: Boolean,
        default: false,
        description: 'Envoyer des liens de paiement aux adhérents',
      },
      manageAdhesions: {
        type: Boolean,
        default: false,
        description: 'Gérer les adhésions (créer, modifier, supprimer)',
      },
      changeAdherentStatus: {
        type: Boolean,
        default: false,
        description: 'Changer le statut de l\'adhérent et marquer les paiements comme effectués',
      },
      exportData: {
        type: Boolean,
        default: false,
        description: 'Exporter les données des adhérents',
      },
    },
    // Module Communications
    communications: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès au module communications',
      },
      sendEmails: {
        type: Boolean,
        default: false,
        description: 'Envoyer des communications par email',
      },
      manageCommunications: {
        type: Boolean,
        default: false,
        description: 'Gérer les communications (créer, modifier, supprimer)',
      },
      viewStats: {
        type: Boolean,
        default: false,
        description: 'Voir les statistiques des communications',
      },
    },
    // Module Actualités (Blog)
    actualites: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès au module actualités',
      },
      createArticles: {
        type: Boolean,
        default: false,
        description: 'Créer des articles',
      },
      editArticles: {
        type: Boolean,
        default: false,
        description: 'Modifier des articles',
      },
      deleteArticles: {
        type: Boolean,
        default: false,
        description: 'Supprimer des articles',
      },
      publishArticles: {
        type: Boolean,
        default: false,
        description: 'Publier/dépublier des articles',
      },
    },
    // Module Paramètres
    parametres: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès aux paramètres de la plateforme',
      },
      manageAdhesionSettings: {
        type: Boolean,
        default: false,
        description: 'Gérer les paramètres d\'adhésion (tarifs, etc.)',
      },
      manageOrganismes: {
        type: Boolean,
        default: false,
        description: 'Gérer les organismes',
      },
    },
    // Module Dashboard
    dashboard: {
      access: {
        type: Boolean,
        default: true, // Tous les admins ont accès au dashboard
        description: 'Accès au dashboard admin',
      },
      viewStats: {
        type: Boolean,
        default: false,
        description: 'Voir les statistiques globales',
      },
    },
    // Module Gestion de l'activité
    gestionActivite: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès au module gestion de l\'activité',
      },
      modifierInfosStatutaires: {
        type: Boolean,
        default: false,
        description: 'Modifier les informations statutaires (composition du conseil et du bureau)',
      },
      consulterCompositions: {
        type: Boolean,
        default: false,
        description: 'Consulter les compositions précédentes (historique des PDF)',
      },
    },
    // Module Réunions
    reunions: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès au module suivi des réunions',
      },
      createReunion: {
        type: Boolean,
        default: false,
        description: 'Créer des réunions',
      },
      editReunion: {
        type: Boolean,
        default: false,
        description: 'Modifier des réunions',
      },
      deleteReunion: {
        type: Boolean,
        default: false,
        description: 'Supprimer des réunions',
      },
      manageDocuments: {
        type: Boolean,
        default: false,
        description: 'Gérer les documents des réunions (ajouter/supprimer)',
      },
      convoquer: {
        type: Boolean,
        default: false,
        description: 'Envoyer des convocations aux membres du bureau ou du conseil',
      },
    },
    // Module Utilisateurs
    users: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès à la liste des utilisateurs',
      },
      editUsers: {
        type: Boolean,
        default: false,
        description: 'Éditer les informations des utilisateurs',
      },
    },
    // Module Finances (Stripe)
    finances: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès au compte Stripe et aux informations financières',
      },
    },
    // Module Suivi Services UNAF
    unafServices: {
      access: {
        type: Boolean,
        default: false,
        description: 'Accès au module suivi des services UNAF (assurances)',
      },
      generateExport: {
        type: Boolean,
        default: false,
        description: 'Générer les exports UNAF manuellement',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Méthode pour vérifier si un utilisateur a une permission spécifique
permissionSchema.methods.hasPermission = function (module, permission) {
  if (!this[module]) return false;
  return this[module][permission] === true;
};

// Méthode pour obtenir toutes les permissions d'un module
permissionSchema.methods.getModulePermissions = function (module) {
  return this[module] || {};
};

// Méthode statique pour créer des permissions par défaut pour un admin
permissionSchema.statics.createDefaultPermissions = async function (userId, role = 'admin') {
  // Permissions par défaut pour un admin standard
  const defaultPermissions = {
    userId,
    adhesions: {
      access: true,
      sendPaymentLink: false,
      manageAdhesions: false,
      changeAdherentStatus: false,
      exportData: false,
    },
    communications: {
      access: false,
      sendEmails: false,
      manageCommunications: false,
      viewStats: false,
    },
    actualites: {
      access: false,
      createArticles: false,
      editArticles: false,
      deleteArticles: false,
      publishArticles: false,
    },
    parametres: {
      access: false,
      manageAdhesionSettings: false,
      manageOrganismes: false,
    },
    dashboard: {
      access: true,
      viewStats: false,
    },
    gestionActivite: {
      access: false,
      modifierInfosStatutaires: false,
      consulterCompositions: false,
    },
    reunions: {
      access: false,
      createReunion: false,
      editReunion: false,
      deleteReunion: false,
      manageDocuments: false,
      convoquer: false,
    },
    users: {
      access: false,
      editUsers: false,
    },
    finances: {
      access: false,
    },
    unafServices: {
      access: false,
      generateExport: false,
    },
  };

  // Si c'est un super_admin, donner toutes les permissions
  if (role === 'super_admin') {
    Object.keys(defaultPermissions).forEach(module => {
      if (module !== 'userId') {
        Object.keys(defaultPermissions[module]).forEach(permission => {
          defaultPermissions[module][permission] = true;
        });
      }
    });
  }

  return await this.create(defaultPermissions);
};

module.exports = mongoose.model('Permission', permissionSchema);
