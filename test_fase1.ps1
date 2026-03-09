Write-Host "=== PRUEBA FASE 1: Stage5-AML Workflow ===" -ForegroundColor Cyan

# TEST 1: Anvil
Write-Host "" 
Write-Host "[1/4] Verificando Anvil (8545)..." -ForegroundColor Yellow
try {
    $anvil = Invoke-RestMethod -Uri 'http://127.0.0.1:8545' -Method POST -ContentType 'application/json' -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
    Write-Host "  OK Anvil respondio - Bloque: $($anvil.result)" -ForegroundColor Green
} catch {
    Write-Host "  FALLO Anvil no disponible: $_" -ForegroundColor Red
    exit 1
}

# TEST 2: Core Engine
Write-Host ""
Write-Host "[2/4] Verificando Core Engine (3001)..." -ForegroundColor Yellow
try {
    $kyc = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/kyc/status/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' -Method GET
    Write-Host "  OK Core Engine respondio - KYC status: $($kyc.status)" -ForegroundColor Green
} catch {
    Write-Host "  FALLO Core Engine no disponible: $_" -ForegroundColor Red
    exit 1
}

# TEST 3a: /aml/check wallet OFAC con api key correcta
Write-Host ""
Write-Host "[3/4] Probando /aml/check con wallet OFAC (riskScore debe ser 100)..." -ForegroundColor Yellow
try {
    $h = @{'x-api-key' = ($env:AML_API_KEY ?? 'SB-AML-SECRET-2026'); 'Content-Type' = 'application/json'}
    $b = '{"wallet":"0xe6a65b3a5147f9660803b9676b79701c704aa6aa"}'
    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/aml/check' -Method POST -Headers $h -Body $b
    Write-Host "  riskScore=$($r.riskScore) clean=$($r.clean) status=$($r.status)"
    if ($r.riskScore -eq 100 -and $r.clean -eq $false) {
        Write-Host "  OK OFAC wallet detectada correctamente" -ForegroundColor Green
    } else {
        Write-Host "  AVISO resultado inesperado" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  FALLO: $_" -ForegroundColor Red
}

# TEST 3b: /aml/check wallet limpia
Write-Host ""
Write-Host "[3b] Probando /aml/check con wallet limpia (riskScore debe ser bajo)..." -ForegroundColor Yellow
try {
    $h = @{'x-api-key' = ($env:AML_API_KEY ?? 'SB-AML-SECRET-2026'); 'Content-Type' = 'application/json'}
    $b = '{"wallet":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"}'
    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/aml/check' -Method POST -Headers $h -Body $b
    Write-Host "  riskScore=$($r.riskScore) clean=$($r.clean) status=$($r.status)"
    if ($r.clean -eq $true) {
        Write-Host "  OK Wallet limpia reconocida" -ForegroundColor Green
    } else {
        Write-Host "  AVISO resultado inesperado" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  FALLO: $_" -ForegroundColor Red
}

# TEST 3c: /aml/check SIN api key debe dar 401
Write-Host ""
Write-Host "[3c] Probando /aml/check SIN api-key (debe dar 401)..." -ForegroundColor Yellow
try {
    $h2 = @{'Content-Type' = 'application/json'}
    $b2 = '{"wallet":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"}'
    $r2 = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/aml/check' -Method POST -Headers $h2 -Body $b2
    Write-Host "  AVISO sin api-key devolvio respuesta: clean=$($r2.clean)" -ForegroundColor Yellow
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) {
        Write-Host "  OK 401 correcto - endpoint solo accesible desde el TEE" -ForegroundColor Green
    } else {
        Write-Host "  INFO error HTTP $code : $_" -ForegroundColor Gray
    }
}

# TEST 4: CRE workflow simulate
Write-Host ""
Write-Host "[4/4] Ejecutando: cre workflow simulate stage5-aml..." -ForegroundColor Yellow
Write-Host "      (El TEE llamara a /aml/check local + checkcryptoaddress.com)" -ForegroundColor Gray

$creRoot = 'C:\Users\simon\DOCUME~1\CREHAC~1\codigo\cre-project'
$payloadArg = "@$creRoot\workflows\stage5-aml\payload.json"

$startTime = Get-Date
$proc = Start-Process -FilePath 'cre' -ArgumentList "workflow", "simulate", "workflows/stage5-aml", "--target", "simulation", "--non-interactive", "--trigger-index", "0", "--http-payload", $payloadArg, "--broadcast" -WorkingDirectory $creRoot -RedirectStandardOutput "$env:TEMP\cre_out.txt" -RedirectStandardError "$env:TEMP\cre_err.txt" -PassThru -NoNewWindow

$finished = $proc.WaitForExit(120000)

$elapsed = [int]((Get-Date) - $startTime).TotalSeconds

if ($finished) {
    $stdout = Get-Content "$env:TEMP\cre_out.txt" -Raw -ErrorAction SilentlyContinue
    $stderr = Get-Content "$env:TEMP\cre_err.txt" -Raw -ErrorAction SilentlyContinue
    $combined = "$stdout`n$stderr"

    Write-Host "  CRE termino en ${elapsed}s con codigo: $($proc.ExitCode)"

    # Mostrar lineas relevantes
    $lines = $combined -split "`n"
    foreach ($line in $lines) {
        $l = $line.Trim()
        if ($l.Length -gt 0) {
            if ($l -match "Stage5|OFAC|Score|TEE|Result|success|freeze|clean|CheckCrypto") {
                Write-Host "    $l" -ForegroundColor Cyan
            } elseif ($l -match "error:|Error|failed|FAILED") {
                Write-Host "    $l" -ForegroundColor Red
            } elseif ($l -match "Build failed|compile") {
                Write-Host "    $l" -ForegroundColor Yellow
            }
        }
    }

    if ($combined -match '"status"\s*:\s*"success"') {
        Write-Host "  OK CRE workflow completado: status=success" -ForegroundColor Green
    } elseif ($proc.ExitCode -eq 0) {
        Write-Host "  OK CRE termino sin errores" -ForegroundColor Green
    } elseif ($combined -match "Build failed") {
        Write-Host "  AVISO Build fallo por problema de rutas con espacios (conocido en el entorno)" -ForegroundColor Yellow
        Write-Host "  INFO El backend resuelve esto usando ruta 8.3 en el spawn(), igual que kyc.js" -ForegroundColor Gray
    } else {
        Write-Host "  INFO Salida relevante del CRE:" -ForegroundColor Gray
        $lines | Where-Object {$_.Trim().Length -gt 0} | Select-Object -Last 8 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    }
} else {
    Write-Host "  TIMEOUT El CRE tardo mas de 120s - deteniendo proceso" -ForegroundColor Yellow
    $proc.Kill()
}

Write-Host ""
Write-Host "=== FIN PRUEBAS FASE 1 ===" -ForegroundColor Cyan
