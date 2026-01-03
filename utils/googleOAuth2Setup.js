/**
 * Script de configuration OAuth2 pour Google Sheets
 * 
 * Exécuter une seule fois pour obtenir le refresh token :
 * node utils/googleOAuth2Setup.js
 * 
 * Pré-requis :
 * 1. Créer un projet dans Google Cloud Console
 * 2. Activer les APIs Google Sheets et Google Drive
 * 3. Créer des credentials OAuth2 (type: Application de bureau)
 * 4. Télécharger le fichier JSON et le renommer en "google-oauth-credentials.json"
 * 5. Placer le fichier dans le dossier backend/
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

const CREDENTIALS_PATH = path.join(__dirname, '..', 'google-oauth-credentials.json');
const PORT = 3333;

async function getRefreshToken() {
  // Vérifier que le fichier de credentials existe
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('❌ Fichier google-oauth-credentials.json non trouvé !');
    console.log('\nÉtapes à suivre :');
    console.log('1. Allez sur https://console.cloud.google.com/');
    console.log('2. Créez un projet ou sélectionnez-en un existant');
    console.log('3. Activez les APIs "Google Sheets API" et "Google Drive API"');
    console.log('4. Allez dans "Credentials" > "Create Credentials" > "OAuth client ID"');
    console.log('5. Type d\'application : "Desktop app"');
    console.log('6. Téléchargez le fichier JSON');
    console.log('7. Renommez-le en "google-oauth-credentials.json"');
    console.log('8. Placez-le dans le dossier backend/');
    console.log('9. Relancez ce script');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    `http://localhost:${PORT}/callback`
  );

  // Générer l'URL d'autorisation
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force le refresh token même si déjà autorisé
  });

  console.log('\n🔐 Authentification OAuth2 Google\n');
  console.log('Ouverture du navigateur pour l\'authentification...\n');

  // Créer un serveur temporaire pour recevoir le callback
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const queryParams = url.parse(req.url, true).query;
        
        if (queryParams.code) {
          // Échanger le code contre les tokens
          const { tokens } = await oauth2Client.getToken(queryParams.code);
          
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; padding: 50px; text-align: center;">
                <h1 style="color: green;">✅ Authentification réussie !</h1>
                <p>Vous pouvez fermer cette fenêtre.</p>
                <p style="color: gray; margin-top: 30px;">Retournez au terminal pour voir les instructions.</p>
              </body>
            </html>
          `);
          
          server.close();
          
          console.log('✅ Authentification réussie !\n');
          console.log('='.repeat(60));
          console.log('Ajoutez ces variables à votre fichier .env :');
          console.log('='.repeat(60));
          console.log(`\nGOOGLE_OAUTH_CLIENT_ID=${client_id}`);
          console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${client_secret}`);
          console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
          console.log('\n' + '='.repeat(60));
          console.log('\n⚠️  Gardez le refresh token secret !');
          console.log('⚠️  Supprimez le fichier google-oauth-credentials.json après configuration');
          
          resolve(tokens);
        } else if (queryParams.error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; padding: 50px; text-align: center;">
                <h1 style="color: red;">❌ Erreur d'authentification</h1>
                <p>${queryParams.error}</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(queryParams.error));
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Erreur interne');
        server.close();
        reject(error);
      }
    });

    server.listen(PORT, async () => {
      console.log(`Serveur de callback démarré sur le port ${PORT}`);
      
      // Ouvrir le navigateur (Windows)
      const openCommand = process.platform === 'win32' 
        ? `start "" "${authUrl}"` 
        : process.platform === 'darwin' 
          ? `open "${authUrl}"` 
          : `xdg-open "${authUrl}"`;
      
      exec(openCommand, (err) => {
        if (err) {
          console.log('\n⚠️  Impossible d\'ouvrir le navigateur automatiquement.');
          console.log('Ouvrez cette URL manuellement :\n');
          console.log(authUrl);
        }
      });
    });

    // Timeout après 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Timeout - authentification non complétée'));
    }, 300000);
  });
}

// Exécuter
getRefreshToken()
  .then(() => {
    console.log('\n🎉 Configuration terminée !');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erreur:', error.message);
    process.exit(1);
  });
