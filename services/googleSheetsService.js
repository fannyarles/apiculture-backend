const { google } = require('googleapis');

// Configuration de l'authentification Google (OAuth2 ou Service Account)
const getAuth = () => {
  // Priorité 1: OAuth2 (compte personnel)
  if (process.env.GOOGLE_OAUTH_CLIENT_ID && 
      process.env.GOOGLE_OAUTH_CLIENT_SECRET && 
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    
    console.log('🔐 Utilisation de l\'authentification OAuth2');
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    });
    
    return oauth2Client;
  }
  
  console.log('🔐 OAuth2 non configuré, vérification Service Account...');
  console.log('  - GOOGLE_OAUTH_CLIENT_ID:', !!process.env.GOOGLE_OAUTH_CLIENT_ID);
  console.log('  - GOOGLE_OAUTH_CLIENT_SECRET:', !!process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  console.log('  - GOOGLE_OAUTH_REFRESH_TOKEN:', !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
  
  // Priorité 2: Service Account (nécessite Google Workspace pour le quota)
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && privateKey) {
    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
  }

  throw new Error('Les credentials Google ne sont pas configurés. Configurez OAuth2 (GOOGLE_OAUTH_*) ou Service Account (GOOGLE_SERVICE_ACCOUNT_*) dans le .env');
};

/**
 * Copie un spreadsheet template
 * @param {string} templateId - ID du spreadsheet template
 * @param {string} newName - Nom de la nouvelle copie
 * @returns {Promise<string>} - ID du nouveau spreadsheet
 */
const copySpreadsheet = async (templateId, newName) => {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  // Utiliser un Shared Drive pour éviter l'erreur de quota des Service Accounts
  const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  const requestBody = { name: newName };
  if (parentFolderId) {
    requestBody.parents = [parentFolderId];
  }

  const response = await drive.files.copy({
    fileId: templateId,
    requestBody,
    supportsAllDrives: true,
  });

  return response.data.id;
};

/**
 * Met à jour des cellules dans un spreadsheet
 * @param {string} spreadsheetId - ID du spreadsheet
 * @param {string} range - Plage de cellules (ex: 'Sheet1!A1:B2')
 * @param {Array<Array>} values - Valeurs à écrire (tableau 2D)
 */
const updateCells = async (spreadsheetId, range, values) => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED', // Permet d'interpréter les formules
    requestBody: {
      values,
    },
  });
};

/**
 * Met à jour une seule cellule
 * @param {string} spreadsheetId - ID du spreadsheet
 * @param {string} cell - Référence de la cellule (ex: 'Sheet1!A1')
 * @param {any} value - Valeur à écrire
 */
const updateCell = async (spreadsheetId, cell, value) => {
  await updateCells(spreadsheetId, cell, [[value]]);
};

/**
 * Met à jour plusieurs cellules individuelles en batch
 * @param {string} spreadsheetId - ID du spreadsheet
 * @param {Array<{range: string, value: any}>} updates - Liste des mises à jour
 */
const batchUpdateCells = async (spreadsheetId, updates) => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const data = updates.map(update => ({
    range: update.range,
    values: [[update.value]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
};

/**
 * Exporte un spreadsheet en format xlsx
 * @param {string} spreadsheetId - ID du spreadsheet
 * @returns {Promise<Buffer>} - Buffer du fichier xlsx
 */
const exportToXlsx = async (spreadsheetId) => {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.export({
    fileId: spreadsheetId,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }, {
    responseType: 'arraybuffer',
  });

  return Buffer.from(response.data);
};

/**
 * Supprime un spreadsheet
 * @param {string} spreadsheetId - ID du spreadsheet à supprimer
 */
const deleteSpreadsheet = async (spreadsheetId) => {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  await drive.files.delete({
    fileId: spreadsheetId,
    supportsAllDrives: true,
  });
};

/**
 * Récupère les informations d'un spreadsheet (notamment les noms des feuilles)
 * @param {string} spreadsheetId - ID du spreadsheet
 * @returns {Promise<Object>} - Informations du spreadsheet
 */
const getSpreadsheetInfo = async (spreadsheetId) => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  return response.data;
};

/**
 * Workflow complet : copie template, remplit données, exporte xlsx, supprime copie
 * @param {string} templateId - ID du template
 * @param {string} exportName - Nom pour l'export
 * @param {Function} fillDataCallback - Fonction async qui reçoit le spreadsheetId et le nom de la feuille pour remplir les données
 * @returns {Promise<Buffer>} - Buffer du fichier xlsx
 */
const generateExcelFromTemplate = async (templateId, exportName, fillDataCallback) => {
  let copiedSpreadsheetId = null;

  try {
    // 1. Copier le template
    console.log('📋 Copie du template Google Sheets...');
    copiedSpreadsheetId = await copySpreadsheet(templateId, exportName);
    console.log(`✅ Template copié: ${copiedSpreadsheetId}`);

    // 2. Récupérer le nom de la première feuille
    const spreadsheetInfo = await getSpreadsheetInfo(copiedSpreadsheetId);
    const sheetName = spreadsheetInfo.sheets[0]?.properties?.title || 'Sheet1';
    console.log(`📄 Feuille active: ${sheetName}`);

    // 3. Remplir les données via le callback
    console.log('📝 Remplissage des données...');
    await fillDataCallback(copiedSpreadsheetId, sheetName);
    console.log('✅ Données remplies');

    // 4. Attendre un peu pour que Google recalcule les formules
    console.log('⏳ Attente du recalcul des formules...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5. Exporter en xlsx
    console.log('📥 Export en xlsx...');
    const xlsxBuffer = await exportToXlsx(copiedSpreadsheetId);
    console.log(`✅ Export terminé (${xlsxBuffer.length} bytes)`);

    return xlsxBuffer;

  } finally {
    // 6. Supprimer la copie (même en cas d'erreur)
    if (copiedSpreadsheetId) {
      try {
        console.log('🗑️ Suppression de la copie temporaire...');
        await deleteSpreadsheet(copiedSpreadsheetId);
        console.log('✅ Copie supprimée');
      } catch (deleteError) {
        console.error('⚠️ Erreur lors de la suppression de la copie:', deleteError.message);
      }
    }
  }
};

module.exports = {
  copySpreadsheet,
  updateCells,
  updateCell,
  batchUpdateCells,
  exportToXlsx,
  deleteSpreadsheet,
  getSpreadsheetInfo,
  generateExcelFromTemplate,
};
