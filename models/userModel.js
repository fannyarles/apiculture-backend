const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
  {
    typePersonne: {
      type: String,
      enum: ['personne_physique', 'association', 'scea', 'earl', 'etablissement_public'],
      default: 'personne_physique',
    },
    designation: {
      type: String,
      enum: ['M.', 'Mme', '', null],
      default: null,
    },
    raisonSociale: {
      type: String,
      required: false,
    },
    prenom: {
      type: String,
      required: [true, 'Le prénom est requis'],
    },
    nom: {
      type: String,
      required: [true, 'Le nom est requis'],
    },
    email: {
      type: String,
      required: [true, "L'email est requis"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Le mot de passe est requis'],
      minlength: 6,
    },
    telephone: {
      type: String,
      required: false,
    },
    adresse: {
      rue: { type: String, required: false },
      complement: { type: String, required: false },
      codePostal: { type: String, required: false },
      ville: { type: String, required: false },
      pays: { type: String, required: false, default: 'France' },
    },
    telephoneMobile: {
      type: String,
      required: false,
    },
    dateNaissance: {
      type: Date,
      required: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'super_admin'],
      default: 'user',
    },
    roles: {
      type: [String],
      enum: ['user', 'admin', 'super_admin'],
      default: function() {
        // Par défaut, roles contient le role principal
        return [this.role || 'user'];
      },
      validate: {
        validator: function(v) {
          // Vérifier que le role principal est dans roles
          return v && v.length > 0;
        },
        message: 'Un utilisateur doit avoir au moins un rôle'
      }
    },
    organisme: {
      type: String,
      enum: ['SAR', 'AMAIR', null],
      required: false,
      // Champ conservé pour compatibilité, mais déprécié
      // Utiliser organismes[] à la place
    },
    organismes: {
      type: [String],
      enum: ['SAR', 'AMAIR'],
      default: [],
      validate: {
        validator: function(v) {
          // Pour les admins, au moins un organisme requis
          if (this.role === 'admin') {
            return v && v.length > 0;
          }
          return true;
        },
        message: 'Un administrateur doit avoir au moins un organisme'
      }
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rolesStatutaires: [{
      organisme: {
        type: String,
        enum: ['SAR', 'AMAIR'],
        required: true,
      },
      titre: {
        type: String,
        enum: [
          'membre du conseil syndical',
          'membre du bureau',
          'membre du conseil d\'administration',
          'membre coopté',
        ],
        required: true,
      },
      fonction: {
        type: String,
        enum: [
          'président',
          'vice-président',
          'secrétaire',
          'secrétaire-adjoint',
          'trésorier',
          'trésorier-adjoint',
          null,
        ],
        default: null,
      },
      dateDebut: {
        type: Date,
        default: Date.now,
      },
    }],
    migrationUNAF2025: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: {
      type: String,
      required: false,
    },
    resetPasswordExpire: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hasher le mot de passe avant sauvegarde
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Méthode pour comparer les mots de passe
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Méthode pour vérifier si l'utilisateur a un rôle spécifique
userSchema.methods.hasRole = function (role) {
  return this.roles && this.roles.includes(role);
};

module.exports = mongoose.model('User', userSchema);
