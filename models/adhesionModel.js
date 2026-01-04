const mongoose = require('mongoose');

const adhesionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organisme: {
      type: String,
      enum: ['SAR', 'AMAIR'],
      required: [true, "L'organisme est requis"],
    },
    annee: {
      type: Number,
      required: [true, "L'année est requise"],
    },
    // Informations apicoles
    napi: {
      type: String,
      required: false,
    },
    numeroAmexa: {
      type: String,
      required: false,
    },
    nombreRuches: {
      type: Number,
      required: false,
      min: 0,
    },
    nombreRuchers: {
      type: Number,
      required: false,
      min: 0,
    },
    localisation: {
      departement: {
        type: String,
        required: false,
      },
      commune: {
        type: String,
        required: false,
      },
    },
    siret: {
      type: String,
      required: false,
    },
    // Paiement
    paiement: {
      montant: {
        type: Number,
        required: true,
      },
      typePaiement: {
        type: String,
        enum: ['cheque', 'espece', 'en_ligne', 'gratuit'],
        required: false,
      },
      status: {
        type: String,
        enum: ['non_demande', 'demande', 'paye', 'refuse'],
        default: 'non_demande',
      },
      dateEnvoiLien: {
        type: Date,
      },
      datePaiement: {
        type: Date,
      },
      note: {
        type: String,
      },
      stripeSessionId: {
        type: String,
      },
      stripePaymentIntentId: {
        type: String,
      },
    },
    // Statut de l'adhésion
    status: {
      type: String,
      enum: ['en_attente', 'paiement_demande', 'actif', 'refuse', 'expiree', 'abandonnee'],
      default: 'en_attente',
    },
    // Indicateur nouvel adhérent (pour calcul droit d'entrée)
    estNouveau: {
      type: Boolean,
      default: false,
    },
    // Notes admin
    notes: {
      type: String,
    },
    // Date de validation
    dateValidation: {
      type: Date,
    },
    // Signature électronique
    signature: {
      type: String,
      required: false,
    },
    // PDF signé (récapitulatif)
    pdfKey: {
      type: String,
    },
    pdfUrl: {
      type: String,
    },
    // Attestation d'adhésion
    attestationKey: {
      type: String,
    },
    attestationUrl: {
      type: String,
    },
    // Bulletin d'adhésion
    bulletinKey: {
      type: String,
    },
    bulletinUrl: {
      type: String,
    },
    // Reçu de paiement Stripe
    receiptKey: {
      type: String,
    },
    // Informations personnelles (snapshot au moment de l'adhésion)
    informationsPersonnelles: {
      typePersonne: {
        type: String,
        enum: ['personne_physique', 'association', 'scea', 'etablissement_public'],
      },
      designation: {
        type: String,
        enum: ['M.', 'Mme'],
      },
      raisonSociale: String,
      nom: String,
      prenom: String,
      dateNaissance: Date,
      adresse: {
        rue: String,
        codePostal: String,
        ville: String,
      },
      telephone: String,
      telephoneMobile: String,
      email: String,
    },
    // Informations spécifiques par organisme
    informationsSpecifiques: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    // Adhésion AMAIR gratuite pour adhérents SAR
    adhesionAMAIRGratuite: {
      type: Boolean,
      default: false,
    },
    // Documents uploadés par l'adhérent
    documents: {
      type: mongoose.Schema.Types.Mixed,
      default: []
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
  },
  {
    timestamps: true,
  }
);

// Index pour recherche rapide
adhesionSchema.index({ user: 1, annee: 1, organisme: 1 });

module.exports = mongoose.model('Adhesion', adhesionSchema);
