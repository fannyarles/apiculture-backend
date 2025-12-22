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
