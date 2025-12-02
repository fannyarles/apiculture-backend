# Script d'installation du backend
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Installation du Backend Apiculture   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si Node.js est installé
Write-Host "Vérification de Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js installé : $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js n'est pas installé" -ForegroundColor Red
    Write-Host "Téléchargez Node.js depuis https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Vérifier si MongoDB est installé
Write-Host "Vérification de MongoDB..." -ForegroundColor Yellow
try {
    $mongoVersion = mongod --version
    Write-Host "✅ MongoDB installé" -ForegroundColor Green
} catch {
    Write-Host "⚠️  MongoDB n'est pas détecté" -ForegroundColor Yellow
    Write-Host "Assurez-vous que MongoDB est installé et dans le PATH" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installation des dépendances npm..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Dépendances installées avec succès" -ForegroundColor Green
} else {
    Write-Host "❌ Erreur lors de l'installation des dépendances" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Vérification du fichier .env..." -ForegroundColor Yellow

if (Test-Path ".env") {
    Write-Host "✅ Fichier .env existant trouvé" -ForegroundColor Green
} else {
    Write-Host "⚠️  Fichier .env non trouvé" -ForegroundColor Yellow
    Write-Host "Création du fichier .env depuis .env.example..." -ForegroundColor Yellow
    
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "✅ Fichier .env créé" -ForegroundColor Green
        Write-Host ""
        Write-Host "⚠️  IMPORTANT : Modifiez le fichier .env avec vos configurations :" -ForegroundColor Yellow
        Write-Host "   - JWT_SECRET : Changez la clé secrète" -ForegroundColor White
        Write-Host "   - STRIPE_SECRET_KEY : Ajoutez votre clé Stripe" -ForegroundColor White
        Write-Host "   - STRIPE_PUBLIC_KEY : Ajoutez votre clé publique Stripe" -ForegroundColor White
        Write-Host "   - STRIPE_WEBHOOK_SECRET : Ajoutez votre secret webhook" -ForegroundColor White
    } else {
        Write-Host "❌ Fichier .env.example non trouvé" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Installation terminée !               " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Prochaines étapes :" -ForegroundColor Yellow
Write-Host "1. Modifiez le fichier .env avec vos configurations" -ForegroundColor White
Write-Host "2. Démarrez MongoDB : net start MongoDB" -ForegroundColor White
Write-Host "3. Démarrez le serveur : npm run dev" -ForegroundColor White
Write-Host "4. Consultez INSTALLATION.md pour créer un admin" -ForegroundColor White
Write-Host ""
Write-Host "Le serveur sera accessible sur http://localhost:5000" -ForegroundColor Green
Write-Host ""
