const mongoose = require('mongoose');

const articleSchema = mongoose.Schema(
  {
    titre: {
      type: String,
      required: [true, 'Le titre est requis'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    contenu: {
      type: String,
      required: [true, 'Le contenu est requis'],
    },
    extrait: {
      type: String,
      maxlength: 300,
    },
    auteur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organisme: {
      type: String,
      enum: ['SAR', 'AMAIR'],
      required: [true, "L'organisme est requis"],
    },
    visibilite: {
      type: String,
      enum: ['tous', 'organisme'],
      required: [true, 'La visibilité est requise'],
      default: 'organisme',
    },
    statut: {
      type: String,
      enum: ['brouillon', 'programme', 'publie'],
      default: 'brouillon',
    },
    datePublication: {
      type: Date,
    },
    imagePrincipale: {
      type: String,
    },
    images: [
      {
        url: String,
        alt: String,
      },
    ],
    tags: [String],
    vues: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour recherche et tri
articleSchema.index({ slug: 1 });
articleSchema.index({ statut: 1, datePublication: -1 });
articleSchema.index({ organisme: 1, visibilite: 1 });
articleSchema.index({ auteur: 1 });

// Méthode pour générer un slug unique
articleSchema.statics.generateSlug = async function (titre, articleId = null) {
  let slug = titre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^a-z0-9\s-]/g, '') // Supprimer caractères spéciaux
    .replace(/\s+/g, '-') // Remplacer espaces par tirets
    .replace(/-+/g, '-') // Supprimer tirets multiples
    .trim();

  // Vérifier l'unicité
  let slugExists = true;
  let counter = 1;
  let finalSlug = slug;

  while (slugExists) {
    const query = { slug: finalSlug };
    if (articleId) {
      query._id = { $ne: articleId };
    }
    const existing = await this.findOne(query);
    if (!existing) {
      slugExists = false;
    } else {
      finalSlug = `${slug}-${counter}`;
      counter++;
    }
  }

  return finalSlug;
};

// Méthode pour vérifier si un article est visible pour un utilisateur
articleSchema.methods.isVisibleFor = function (user) {
  // Si brouillon, seulement visible par l'auteur ou admin du même organisme
  if (this.statut === 'brouillon') {
    return (
      user &&
      (this.auteur.toString() === user._id.toString() ||
        (user.role === 'admin' && user.organisme === this.organisme))
    );
  }

  // Si programmé, vérifier la date
  if (this.statut === 'programme') {
    if (!this.datePublication || new Date() < this.datePublication) {
      return (
        user &&
        (this.auteur.toString() === user._id.toString() ||
          (user.role === 'admin' && user.organisme === this.organisme))
      );
    }
  }

  // Si publié
  if (this.statut === 'publie') {
    // Vérifier la visibilité
    if (this.visibilite === 'tous') {
      return true; // Visible par tous les adhérents
    } else if (this.visibilite === 'organisme') {
      return user && user.organisme === this.organisme;
    }
  }

  return false;
};

module.exports = mongoose.model('Article', articleSchema);
