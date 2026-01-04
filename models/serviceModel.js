const mongoose = require('mongoose');

const serviceSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adhesion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Adhesion',
      required: true,
    },
    organisme: {
      type: String,
      enum: ['AMAIR', 'SAR'],
      required: true,
    },
    typeService: {
      type: String,
      enum: ['miellerie', 'assurance_unaf'],
      required: true,
    },
    nom: {
      type: String,
      required: true,
    },
    annee: {
      type: Number,
      required: true,
    },
    // Paiement du droit d'usage
    paiement: {
      montant: {
        type: Number,
        required: true,
      },
      typePaiement: {
        type: String,
        enum: ['cheque', 'en_ligne'],
        required: false,
      },
      status: {
        type: String,
        enum: ['en_attente', 'paye'],
        default: 'en_attente',
      },
      datePaiement: {
        type: Date,
      },
      stripeSessionId: {
        type: String,
      },
      stripePaymentIntentId: {
        type: String,
      },
      // Tracking pour export UNAF
      exportedToUNAF: {
        type: Boolean,
        default: false,
      },
      exportDate: {
        type: Date,
      },
    },
    // Tracking du chèque de caution
    caution: {
      montant: {
        type: Number,
        default: 300,
      },
      status: {
        type: String,
        enum: ['en_attente', 'recu', 'rendu'],
        default: 'en_attente',
      },
      dateReception: {
        type: Date,
      },
      dateRendu: {
        type: Date,
      },
      note: {
        type: String,
      },
    },
    // Statut global du service
    status: {
      type: String,
      enum: ['en_attente_paiement', 'en_attente_caution', 'en_attente_validation', 'actif', 'expire', 'abandonnee'],
      default: 'en_attente_paiement',
    },
    // Signature électronique
    signature: {
      type: String,
      required: false,
    },
    // Acceptation du règlement intérieur
    acceptationReglement: {
      type: Boolean,
      default: false,
    },
    // Date de validation (passage en actif)
    dateValidation: {
      type: Date,
    },
    // Attestation de souscription au service
    attestationKey: {
      type: String,
    },
    attestationUrl: {
      type: String,
    },
    // Attestation écocontribution (UNAF)
    ecocontributionAttestationKey: {
      type: String,
    },
    ecocontributionAttestationUrl: {
      type: String,
    },
    // Reçu de paiement Stripe
    receiptKey: {
      type: String,
    },
    // Document de preuve de paiement (uploadé par l'admin)
    documentPaiement: {
      nom: String,
      key: String,
      url: String,
      dateUpload: Date,
      uploadePar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    // Informations personnelles (snapshot au moment de la souscription)
    informationsPersonnelles: {
      nom: String,
      prenom: String,
      adresse: {
        rue: String,
        codePostal: String,
        ville: String,
      },
      telephone: String,
      email: String,
    },
    // Données spécifiques aux services  de l'UNAF
    unafData: {
      siret: String,
      nombreEmplacements: Number,
      nombreRuches: Number,
      // Options sélectionnées
      options: {
        cotisationUNAF: {
          montant: { type: Number, default: 1.50 },
        },
        affairesJuridiques: {
          souscrit: { type: Boolean, default: false },
          prixParRuche: { type: Number, default: 0.15 },
          montant: Number,
        },
        ecocontribution: {
          souscrit: { type: Boolean, default: false },
          prixParRuche: { type: Number, default: 0.12 },
          montant: Number,
        },
        revue: {
          choix: {
            type: String,
            enum: ['papier', 'numerique', 'papier_numerique', 'aucun'],
          },
          montant: Number,
        },
        assurance: {
          formule: {
            type: String,
            enum: ['aucune', 'formule1', 'formule2', 'formule3'],
          },
          prixParRuche: Number,
          montant: Number,
        },
      },
      // Détail des montants
      detailMontants: {
        cotisationUNAF: Number,
        affairesJuridiques: Number,
        ecocontribution: Number,
        revue: Number,
        assurance: Number,
        total: Number,
      },
    },
    // Historique des modifications de la souscription
    historiqueModifications: [{
      date: {
        type: Date,
        default: Date.now,
      },
      type: {
        type: String,
        enum: ['creation', 'modification'],
        default: 'modification',
      },
      modifications: {
        formuleAvant: String,
        formuleApres: String,
        revueAvant: String,
        revueApres: String,
        affairesJuridiquesAvant: Boolean,
        affairesJuridiquesApres: Boolean,
        ecocontributionAvant: Boolean,
        ecocontributionApres: Boolean,
      },
      montantSupplementaire: {
        type: Number,
        default: 0,
      },
      paiement: {
        stripeSessionId: String,
        stripePaymentIntentId: String,
        status: {
          type: String,
          enum: ['en_attente', 'paye'],
          default: 'en_attente',
        },
        datePaiement: Date,
        receiptKey: String,
      },
      signature: String,
      signatureDate: Date,
      // Tracking pour export UNAF
      exportedToUNAF: {
        type: Boolean,
        default: false,
      },
      exportDate: {
        type: Date,
      },
    }],
  },
  {
    timestamps: true,
  }
);

// Index unique pour éviter les doublons (un user ne peut souscrire qu'une fois par année/service)
serviceSchema.index({ user: 1, typeService: 1, annee: 1 }, { unique: true });

// Index pour les requêtes fréquentes
serviceSchema.index({ adhesion: 1 });
serviceSchema.index({ organisme: 1, annee: 1 });
serviceSchema.index({ status: 1 });

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
