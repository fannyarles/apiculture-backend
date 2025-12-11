Write-Host "=== CRÉATION DU SUPER-ADMIN ===" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Join-Path $PSScriptRoot "create-superadmin-simple.js"

try {
    node $scriptPath
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Opération réussie!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Vous pouvez maintenant vous connecter avec:" -ForegroundColor Yellow
        Write-Host "  Email: superadmin@apiculture.fr" -ForegroundColor White
        Write-Host "  Mot de passe: SuperAdmin2024!" -ForegroundColor White
        Write-Host ""
        Write-Host "⚠️  N'oubliez pas de changer ce mot de passe après la première connexion!" -ForegroundColor Red
    } else {
        Write-Host ""
        Write-Host "❌ Une erreur s'est produite" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Appuyez sur une touche pour continuer..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
