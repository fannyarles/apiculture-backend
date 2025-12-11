/**
 * Helper functions pour gérer les organismes des utilisateurs
 */

/**
 * Récupère les organismes d'un utilisateur (gère la compatibilité ancien/nouveau format)
 * @param {Object} user - L'objet utilisateur
 * @returns {Array} - Tableau des organismes
 */
const getUserOrganismes = (user) => {
  if (!user) return [];
  
  // Super admin a accès à tous les organismes
  if (user.role === 'super_admin') {
    return ['SAR', 'AMAIR'];
  }
  
  // Nouveau format : tableau organismes
  if (user.organismes && user.organismes.length > 0) {
    return user.organismes;
  }
  
  // Ancien format : champ organisme unique (compatibilité)
  if (user.organisme) {
    return [user.organisme];
  }
  
  return [];
};

/**
 * Vérifie si un utilisateur a accès à un organisme spécifique
 * @param {Object} user - L'objet utilisateur
 * @param {String} organisme - L'organisme à vérifier
 * @returns {Boolean}
 */
const hasAccessToOrganisme = (user, organisme) => {
  if (!user || !organisme) return false;
  
  // Super admin a accès à tout
  if (user.role === 'super_admin') {
    return true;
  }
  
  const userOrganismes = getUserOrganismes(user);
  return userOrganismes.includes(organisme);
};

/**
 * Crée un filtre MongoDB pour les organismes d'un utilisateur
 * @param {Object} user - L'objet utilisateur
 * @param {String} fieldName - Nom du champ organisme dans la collection (défaut: 'organisme')
 * @returns {Object} - Filtre MongoDB
 */
const getOrganismeFilter = (user, fieldName = 'organisme') => {
  if (!user) return {};
  
  // Super admin voit tout
  if (user.role === 'super_admin') {
    return {};
  }
  
  const userOrganismes = getUserOrganismes(user);
  
  if (userOrganismes.length === 0) {
    // Aucun organisme : ne rien retourner
    return { [fieldName]: null };
  }
  
  if (userOrganismes.length === 1) {
    // Un seul organisme
    return { [fieldName]: userOrganismes[0] };
  }
  
  // Plusieurs organismes : utiliser $in
  return { [fieldName]: { $in: userOrganismes } };
};

/**
 * Formate les organismes pour l'affichage
 * @param {Object} user - L'objet utilisateur
 * @returns {String} - Chaîne formatée des organismes
 */
const formatOrganismesDisplay = (user) => {
  if (!user) return '';
  
  if (user.role === 'super_admin') {
    return 'Tous les organismes';
  }
  
  const organismes = getUserOrganismes(user);
  
  if (organismes.length === 0) {
    return 'Aucun organisme';
  }
  
  if (organismes.length === 1) {
    return organismes[0];
  }
  
  return organismes.join(' + ');
};

module.exports = {
  getUserOrganismes,
  hasAccessToOrganisme,
  getOrganismeFilter,
  formatOrganismesDisplay,
};
