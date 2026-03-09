$BlockchainPath = "c:\Users\simon\Documents\CRE Hackthon\codigo\blockchain"
$OnchainJs = "c:\Users\simon\Documents\CRE Hackthon\codigo\core-engine\utils\onchain.js"

Write-Host ""
Write-Host "Reading Forge broadcast files..." -ForegroundColor Cyan

$bondBroadcast = "$BlockchainPath\broadcast\DeployStealthBond.s.sol\31337\run-latest.json"
if (-not (Test-Path $bondBroadcast)) {
    Write-Host "ERROR: Not found: $bondBroadcast" -ForegroundColor Red
    exit 1
}

$bondJson = Get-Content $bondBroadcast | ConvertFrom-Json
$factoryProxy = $null
foreach ($tx in $bondJson.transactions) {
    if ($tx.transactionType -eq "CREATE" -and $tx.contractName -eq "ERC1967Proxy") {
        $factoryProxy = $tx.contractAddress
        break
    }
}

if (-not $factoryProxy) {
    Write-Host "ERROR: ERC1967Proxy not found in StealthBond broadcast" -ForegroundColor Red
    exit 1
}
Write-Host "  StealthBondFactory proxy: $factoryProxy" -ForegroundColor Green

$vaultBroadcast = "$BlockchainPath\broadcast\DeployStage4.s.sol\31337\run-latest.json"
if (-not (Test-Path $vaultBroadcast)) {
    Write-Host "ERROR: Not found: $vaultBroadcast" -ForegroundColor Red
    exit 1
}

$vaultJson = Get-Content $vaultBroadcast | ConvertFrom-Json
$vaultProxy = $null
foreach ($tx in $vaultJson.transactions) {
    if ($tx.transactionType -eq "CREATE" -and $tx.contractName -eq "ERC1967Proxy") {
        $vaultProxy = $tx.contractAddress
        break
    }
}

if (-not $vaultProxy) {
    Write-Host "ERROR: ERC1967Proxy not found in Stage4 broadcast" -ForegroundColor Red
    exit 1
}
Write-Host "  StealthVaultEscrow proxy: $vaultProxy" -ForegroundColor Green

Write-Host ""
Write-Host "Updating $OnchainJs..." -ForegroundColor Cyan

$lines = Get-Content $OnchainJs
$newLines = @()
foreach ($line in $lines) {
    if ($line -match "stealthBondFactory:") {
        $newLines += "    stealthBondFactory: '$factoryProxy', // Proxy Factory - auto-updated"
    }
    elseif ($line -match "stealthVaultEscrow:") {
        $newLines += "    stealthVaultEscrow: '$vaultProxy'  // Vault Proxy - auto-updated"
    }
    else {
        $newLines += $line
    }
}
$newLines | Set-Content $OnchainJs

Write-Host "Done. onchain.js updated." -ForegroundColor Green
Write-Host ""
Write-Host "  stealthBondFactory = $factoryProxy"
Write-Host "  stealthVaultEscrow = $vaultProxy"
Write-Host ""
Write-Host "Restart Node.js server to apply changes." -ForegroundColor Cyan
