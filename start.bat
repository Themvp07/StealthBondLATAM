@echo off
title StealthBond LATAM - Dev Stack
color 0A
cls
echo ============================================
echo   StealthBond LATAM - Stack de Desarrollo
echo ============================================
echo.
echo Levantando servicios...
echo.

REM --- 1. Anvil (blockchain local con estado persistente) ---
echo [1/4] Iniciando Anvil (blockchain local en :8545, estado persistente)...
start "Anvil - Blockchain Local" cmd /k "cd /d "%~dp0blockchain" && anvil --state anvil-state.json"
timeout /t 3 /nobreak >nul

REM --- 2. Desplegar contratos (solo si es la primera vez) ---
echo [2/4] Verificando contratos...
cd /d "%~dp0blockchain"
if exist "anvil-state.json" (
    echo      OK - Estado existente detectado. Contratos ya desplegados, omitiendo.
) else (
    echo      Primera vez: desplegando contratos...
    forge script script/DeployStage6.s.sol:DeployStage6 --rpc-url http://127.0.0.1:8545 --private-key %PRIVATE_KEY% --broadcast >nul 2>&1
    if %errorlevel% == 0 (
        echo      OK - Contratos desplegados y guardados en anvil-state.json
    ) else (
        echo      ERROR al desplegar contratos.
    )
)

REM --- 3. Core Engine ---
echo [3/4] Iniciando Core Engine (backend en :3001)...
start "Core Engine - Backend" cmd /k "cd /d "%~dp0core-engine" && node server.js"
timeout /t 2 /nobreak >nul

REM --- 4. Frontend ---
echo [4/4] Iniciando Frontend (en :3000)...
start "Frontend - StealthBond" cmd /k "cd /d "%~dp0frontend" && npx serve -l 3000"
timeout /t 2 /nobreak >nul

echo.
echo ============================================
echo   STACK LISTO
echo ============================================
echo.
echo   Blockchain:  http://127.0.0.1:8545
echo   Backend API: http://127.0.0.1:3001
echo   Frontend:    http://localhost:3000
echo.
echo   Contratos (Anvil):
echo   - KeystoneForwarder: 0x5FbDB2315678afecb367f032d93F642f64180aa3
echo   - AgentRegistry:     0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
echo.
echo   MetaMask:
echo   - RPC URL:  http://127.0.0.1:8545
echo   - Chain ID: 31337
echo   - Symbol:   ETH
echo.
echo   Cuenta Anvil para importar en MetaMask:
echo   Pk: [HIDDEN_FOR_SECURITY] (Use Account #0 Private Key from Anvil)
echo.
echo Abre el navegador en http://localhost:3000
echo.
pause
