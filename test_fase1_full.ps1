Write-Host "=== PREPARANDO ENTORNO PARA PRUEBA ===" -ForegroundColor Cyan

# 1. Levantar Anvil en background
Write-Host "[1/2] Levantando Anvil..." -ForegroundColor Yellow
$anvilJob = Start-Job -ScriptBlock { anvil --silent }
Start-Sleep -Seconds 3

# 2. Levantar el Core Engine en background 
Write-Host "[2/2] Levantando Core Engine..." -ForegroundColor Yellow
$coreJob = Start-Job -ScriptBlock { 
    Set-Location "c:\Users\simon\Documents\CRE Hackthon\codigo\core-engine"
    node server.js 
}
Start-Sleep -Seconds 4

Write-Host "=== INICIANDO PRUEBAS FASE 1 ===" -ForegroundColor Cyan
& "c:\Users\simon\Documents\CRE Hackthon\codigo\test_fase1.ps1"

Write-Host "=== LIMPIANDO ENTORNO ===" -ForegroundColor Cyan
Write-Host "Deteniendo Core Engine y Anvil..." -ForegroundColor Yellow
Stop-Job $coreJob
Remove-Job $coreJob
Stop-Job $anvilJob
Remove-Job $anvilJob
Write-Host "✅ Limpieza completa." -ForegroundColor Green
