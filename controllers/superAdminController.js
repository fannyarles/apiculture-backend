const User = require('../models/userModel');
const Permission = require('../models/permissionModel');
const NotificationSettings = require('../models/notificationSettingsModel');
const { envoyerEmailBienvenueAdmin } = require('../services/emailService');

// @desc    Get all admins
// @route   GET /api/users/admins
// @access  Super Admin
const getAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' }).select('-password');
    
    // Ajouter les permissions et les paramètres de notification pour chaque admin
    const adminsWithDetails = await Promise.all(
      admins.map(async (admin) => {
        const adminObj = admin.toObject();
        
        // Récupérer les permissions
        const permissions = await Permission.findOne({ userId: admin._id });
        adminObj.permissions = permissions || null;
        
        // Récupérer les paramètres de notification
        const notificationSettings = await NotificationSettings.findOne({ userId: admin._id });
        adminObj.notificationSettings = notificationSettings || null;
        
        return adminObj;
      })
    );
    
    res.json(adminsWithDetails);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Create new admin
// @route   POST /api/users/admin
// @access  Super Admin
const createAdmin = async (req, res) => {
  try {
    const { prenom, nom, email, password, organismes } = req.body;

    // Vérifier si l'email existe déjà
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    // Sauvegarder le mot de passe en clair pour l'email (avant hachage)
    const passwordClair = password;

    // Créer l'admin
    const admin = await User.create({
      prenom,
      nom,
      email,
      password,
      role: 'admin',
      roles: ['admin', 'user'], // Un admin a aussi accès à l'interface user
      organismes: organismes || [],
      // Garder organisme pour compatibilité (premier organisme du tableau)
      organisme: organismes && organismes.length > 0 ? organismes[0] : null,
    });

    // Créer les permissions par défaut pour cet admin dans le modèle Permission
    let adminPermissions = null;
    try {
      adminPermissions = await Permission.createDefaultPermissions(admin._id, admin.role);
    } catch (permError) {
      console.error('Erreur lors de la création des permissions:', permError);
      // Ne pas bloquer la création de l'admin si les permissions échouent
    }

    // Envoyer l'email de bienvenue avec les identifiants
    try {
      await envoyerEmailBienvenueAdmin(admin, passwordClair);
      console.log(`📧 Email de bienvenue envoyé à ${admin.email}`);
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email de bienvenue:', emailError);
      // Ne pas bloquer la création de l'admin si l'email échoue
    }

    res.status(201).json({
      _id: admin._id,
      prenom: admin.prenom,
      nom: admin.nom,
      email: admin.email,
      role: admin.role,
      organisme: admin.organisme,
      organismes: admin.organismes,
      permissions: adminPermissions,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la création', error: error.message });
  }
};

// @desc    Update admin
// @route   PUT /api/users/admin/:id
// @access  Super Admin
const updateAdmin = async (req, res) => {
  try {
    const { prenom, nom, email, password, organismes } = req.body;

    const admin = await User.findById(req.params.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ message: 'Administrateur non trouvé' });
    }

    // Mettre à jour les champs
    admin.prenom = prenom || admin.prenom;
    admin.nom = nom || admin.nom;
    admin.email = email || admin.email;
    admin.organismes = organismes !== undefined ? organismes : admin.organismes;
    // Garder organisme pour compatibilité (premier organisme du tableau)
    admin.organisme = organismes && organismes.length > 0 ? organismes[0] : null;

    // Mettre à jour le mot de passe seulement s'il est fourni
    if (password) {
      admin.password = password;
    }

    await admin.save();

    // Récupérer les permissions depuis le modèle Permission
    const adminPermissions = await Permission.findOne({ userId: admin._id });

    res.json({
      _id: admin._id,
      prenom: admin.prenom,
      nom: admin.nom,
      email: admin.email,
      role: admin.role,
      organisme: admin.organisme,
      organismes: admin.organismes,
      permissions: adminPermissions,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
  }
};

// @desc    Delete admin
// @route   DELETE /api/users/admin/:id
// @access  Super Admin
const deleteAdmin = async (req, res) => {
  try {
    const admin = await User.findById(req.params.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ message: 'Administrateur non trouvé' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Administrateur supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
  }
};

module.exports = {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
};
