const AWS = require('aws-sdk');

// Configuration S3 pour OVH
const s3 = new AWS.S3({
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: process.env.S3_REGION || 'gra',
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

const bucketName = process.env.S3_BUCKET_NAME;

/**
 * Upload un fichier vers S3
 * @param {Buffer} fileBuffer - Le contenu du fichier
 * @param {string} fileName - Le nom du fichier
 * @param {string} mimeType - Le type MIME du fichier
 * @param {string} folder - Le dossier de destination (optionnel)
 * @returns {Promise<Object>} - URL et clé du fichier
 */
const uploadFile = async (fileBuffer, fileName, mimeType, folder = 'documents') => {
  const key = `${folder}/${Date.now()}-${fileName}`;
  
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'private' // Fichiers privés, accessibles uniquement via URL signée
  };

  try {
    const result = await s3.upload(params).promise();
    
    // Générer une URL signée valide pour 7 jours (604800 secondes)
    const signedUrl = await getSignedUrl(result.Key, 604800);
    
    return {
      key: result.Key,
      url: signedUrl,
      bucket: result.Bucket
    };
  } catch (error) {
    console.error('Erreur upload S3:', error);
    throw new Error('Erreur lors de l\'upload du fichier vers S3');
  }
};

/**
 * Génère une URL signée pour télécharger un fichier
 * @param {string} key - La clé du fichier dans S3
 * @param {number} expiresIn - Durée de validité en secondes (défaut: 1 heure)
 * @returns {Promise<string>} - URL signée
 */
const getSignedUrl = async (key, expiresIn = 3600) => {
  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: expiresIn
  };

  try {
    const url = await s3.getSignedUrlPromise('getObject', params);
    return url;
  } catch (error) {
    console.error('Erreur génération URL signée:', error);
    throw new Error('Erreur lors de la génération de l\'URL de téléchargement');
  }
};

/**
 * Supprime un fichier de S3
 * @param {string} key - La clé du fichier dans S3
 * @returns {Promise<void>}
 */
const deleteFile = async (key) => {
  const params = {
    Bucket: bucketName,
    Key: key
  };

  try {
    await s3.deleteObject(params).promise();
  } catch (error) {
    console.error('Erreur suppression S3:', error);
    throw new Error('Erreur lors de la suppression du fichier');
  }
};

/**
 * Liste les fichiers d'un dossier
 * @param {string} prefix - Le préfixe/dossier à lister
 * @returns {Promise<Array>} - Liste des fichiers
 */
const listFiles = async (prefix = 'documents/') => {
  const params = {
    Bucket: bucketName,
    Prefix: prefix
  };

  try {
    const result = await s3.listObjectsV2(params).promise();
    return result.Contents || [];
  } catch (error) {
    console.error('Erreur listage S3:', error);
    throw new Error('Erreur lors du listage des fichiers');
  }
};

/**
 * Vérifie si un fichier existe
 * @param {string} key - La clé du fichier dans S3
 * @returns {Promise<boolean>}
 */
const fileExists = async (key) => {
  const params = {
    Bucket: bucketName,
    Key: key
  };

  try {
    await s3.headObject(params).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

/**
 * Télécharge un fichier depuis S3
 * @param {string} key - La clé du fichier dans S3
 * @returns {Promise<Buffer>} - Le contenu du fichier
 */
const downloadFile = async (key) => {
  const params = {
    Bucket: bucketName,
    Key: key
  };

  try {
    const result = await s3.getObject(params).promise();
    return result.Body;
  } catch (error) {
    console.error('Erreur téléchargement S3:', error);
    throw new Error('Erreur lors du téléchargement du fichier depuis S3');
  }
};

module.exports = {
  uploadFile,
  getSignedUrl,
  deleteFile,
  listFiles,
  fileExists,
  downloadFile
};
