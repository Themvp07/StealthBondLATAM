/**
 * On-Chain Writer for StealthBond LATAM Core Engine
 * 
 * Sends real transactions to the deployed contracts on Anvil.
 * Uses DON Signer (Anvil Account #9) to call the KeystoneForwarder,
 * which in turn writes to the AgentRegistry via onReport().
 * 
 * Anvil Addresses (Deterministic Deploy.s.sol - always the same on clean Anvil):
 *   Deployer = Account #0 → KeystoneForwarder = 0x5FbDB...  AgentRegistry = 0xe7f17...
 */
const { ethers } = require('ethers');

// ============================================
// CONFIG (hardcoded for deterministic Anvil)
// ============================================
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';

// DON Signer = Anvil Account #0 (Because DeployStage1Company assigned TEE permissions to this key)
const DON_SIGNER_KEY = process.env.DON_SIGNER_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Exact addresses from deterministic Anvil deploy (forge script --broadcast)
const CONTRACTS = {
    creComplianceIssuer: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853', // Proxy Issuer (Fase 3)
    identityRegistry: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',    // Proxy Identity ACE
    agentRegistry: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',       // Facade (Issuer) for backward compatibility
    keystoneForwarder: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',   // Mock Forwarder (Issuer)
    usdc: '0x68b1d87f95878fe05b998f19b66f4baba5de1aed',  // Stealth USDC
    ves: '0x3aa5ebb10dc797cac828524e59a333d0a371443c',   // Stealth VES
    eurc: '0xc6e7df5e7b4f2a278906862b61205850344d4e7d',  // Stealth EURC
    stealthBondFactory: '0x4c4a2f8c81640e47606d3fd77b353e87ba015584', // Proxy Factory - auto-updated
    stealthVaultEscrow: '0xdc11f7e700a4c898ae5caddb1082cffa76512add'  // Vault Proxy - auto-updated
};

console.log("🛠️ [BACKEND INIT] CONTRACTS loaded:", CONTRACTS);

// ============================================
// ABIs — Must EXACTLY match the deployed .sol files
// ============================================

// KeystoneForwarder.sol: function report(address, bytes, bytes, bytes[]) external
const FORWARDER_ABI = [
    'function report(address receiver, bytes calldata metadata, bytes calldata reportPayload, bytes[] calldata signatures) external',
    'function donSigner() view returns (address)',
    'function targetRegistry() view returns (address)'
];

// AgentRegistry.sol: onReport decodes (address, uint8, bytes32, address, uint256)
// isVerified(address, uint256) view returns (bool)
const REGISTRY_ABI = [
    'function isVerified(address wallet, uint256 minLevel) view returns (bool)',
    'function registry(address) view returns (uint8 entityType, bytes32 ccid, address tutor, uint256 level, bool active)',
    'function onReport(bytes calldata metadata, bytes calldata reportPayload) external'
];

// Entity type enum mapping (must match Solidity enum EntityType)
const ENTITY_TYPES = {
    person: 1,
    company: 2,
    ai_agent: 3
};

// ============================================
// PROVIDER & SIGNER (singletons)
// ============================================
let _provider = null;
let _donSigner = null;

function getProvider() {
    if (!_provider) {
        _provider = new ethers.JsonRpcProvider(RPC_URL);
    }
    return _provider;
}

function getDonSigner() {
    if (!_donSigner) {
        _donSigner = new ethers.Wallet(DON_SIGNER_KEY, getProvider());
    }
    return _donSigner;
}

// ============================================
// CORE WRITE FUNCTION
// ============================================

/**
 * Registers an identity in the AgentRegistry via KeystoneForwarder.report()
 * The Forwarder calls AgentRegistry.onReport(metadata, reportPayload)
 * onReport decodes: (address wallet, uint8 entityType, bytes32 ccid, address tutor, uint256 level)
 * 
 * Guarantees:
 *  1. Uses tx.wait() → the TX is mined BEFORE returning.
 *  2. Verifies isVerified() on the backend (direct RPC provider) after mining.
 *  3. Only returns { success: true } when the state is visible on the node.
 */
async function registerIdentityOnChain(wallet, entityType, ccidData, tutorAddress = ethers.ZeroAddress, level = 1) {
    // Normalize address to lowercase to avoid checksum mismatch
    const cleanWallet = wallet.toLowerCase();

    try {
        const signer = getDonSigner();
        const registryWrite = new ethers.Contract(CONTRACTS.agentRegistry, REGISTRY_ABI, signer);

        // CCID must be the exact one expected by CREComplianceIssuer
        ccid = ccidData;
        if (typeof ccid === 'string' && ccid.startsWith('0x')) {
            ccid = ccid.padEnd(66, '0');
        } else {
            console.warn("Invalid CCID or not provided correctly, using hardcoded for simulation");
            ccid = ethers.keccak256(ethers.toUtf8Bytes(String(Date.now())));
        }

        // 2. Credential to emit: VENEZUELA_KYB_LEI_PASSED (formatted to bytes32)
        let credentialTypeId;
        if (entityType === 'company' || entityType === ENTITY_TYPES.company) {
            const credentialSeed = "VENEZUELA_KYB_LEI_PASSED";
            credentialTypeId = ethers.hexlify(ethers.toUtf8Bytes(credentialSeed)).padEnd(66, '0');
        } else {
            credentialTypeId = ethers.hexlify(ethers.toUtf8Bytes("GENERIC_CREDENTIAL")).padEnd(66, '0');
        }

        // 3. Expiration: 365 days from now (in seconds)
        const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

        // ABI-encode PAYLOAD as expected by CREComplianceIssuer: (bytes32 ccid, address wallet, bytes32 credentialTypeId, uint40 expiresAt)
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const reportPayload = abiCoder.encode(
            ['bytes32', 'address', 'bytes32', 'uint40'],
            [ccid, cleanWallet, credentialTypeId, expiresAt]
        );

        const metadata = '0x';

        console.log(`[OnChain] → Calling CREComplianceIssuer.onReport() DIRECTLY at Registry=${CONTRACTS.agentRegistry}`);
        console.log(`[OnChain]   Wallet: ${cleanWallet} | CCID: ${ccid.slice(0, 18)}...`);

        const tx = await registryWrite.onReport(metadata, reportPayload);

        // WAIT FOR ANVIL TO MINE THE BLOCK — MANDATORY
        const receipt = await tx.wait();
        console.log(`[OnChain] ✅ TX mined in block #${receipt.blockNumber}: ${receipt.hash}`);

        // POST-WRITE VERIFICATION: wait until state is visible
        // via the same backend RPC provider (not MetaMask)
        const p = getProvider();
        const registry = new ethers.Contract(CONTRACTS.agentRegistry, REGISTRY_ABI, p);

        let visible = false;
        for (let i = 0; i < 8; i++) {
            visible = await registry.isVerified(cleanWallet, level);
            if (visible) break;
            console.log(`[OnChain] Waiting for state visibility... attempt ${i + 1}/8`);
            await new Promise(r => setTimeout(r, 200));
        }

        if (!visible) {
            // This would only happen if the contract has a logical bug,
            // it's not a timing issue — throw a clear error.
            throw new Error(`TX mined (${receipt.hash}) but isVerified() returns false. Check AgentRegistry.sol.`);
        }

        console.log(`[OnChain] ✅ State verified on node for ${cleanWallet}`);
        return { success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber };

    } catch (err) {
        console.error('[OnChain] ❌ Error:', err.message);
        return { success: false, txHash: null, error: err.message };
    }
}

// ============================================
// READ FUNCTIONS
// ============================================

/**
 * Burns mock stablecoins on-chain as a settlement mechanism.
 */
async function debitOnChain(wallet, currency, amountUSD) {
    try {
        const p = getProvider();
        const signer = new ethers.Wallet(DON_SIGNER_KEY, p);
        const abi = [
            'function burn(address from, uint256 amount) external',
            'function decimals() view returns (uint8)'
        ];

        let tokenAddress = CONTRACTS.usdc;
        if (currency === 'VES') tokenAddress = CONTRACTS.ves;
        if (currency === 'EURC') tokenAddress = CONTRACTS.eurc;

        if (!tokenAddress || tokenAddress === '0x' || tokenAddress === ethers.ZeroAddress) {
            console.warn(`[OnChain] No contract for ${currency}, skipping real debit.`);
            return true; // Consider success for demo if no contract is configured
        }

        const token = new ethers.Contract(tokenAddress, abi, signer);
        const decimals = await token.decimals();

        // Conversion rate (Ideally would come from PriceFeed.js, but for simplicity...)
        let amountToBurn = amountUSD;
        if (currency === 'VES') amountToBurn = amountUSD * 42.50; // Fixed demo rate
        if (currency === 'EURC') amountToBurn = amountUSD / 1.08;

        const amountRaw = ethers.parseUnits(amountToBurn.toFixed(6), decimals);

        const tx = await token.burn(wallet.toLowerCase(), amountRaw);
        await tx.wait();
        return true;
    } catch (err) {
        console.error(`[OnChain] ❌ Error debiting ${amountUSD} ${currency} from ${wallet}:`, err.message);
        return false;
    }
}

/**
 * Checks if a wallet is registered in AgentRegistry (via direct RPC, not MetaMask).
 */
async function isVerifiedOnChain(wallet, minLevel = 1) {
    try {
        const p = getProvider();
        const registry = new ethers.Contract(CONTRACTS.agentRegistry, REGISTRY_ABI, p);
        return await registry.isVerified(wallet.toLowerCase(), minLevel);
    } catch (err) {
        console.warn('[OnChain] isVerified check failed:', err.message);
        return false;
    }
}

async function getTokenBalance(wallet, tokenAddress) {
    try {
        const p = getProvider();
        const abi = [
            'function balanceOf(address account) view returns (uint256)',
            'function decimals() view returns (uint8)'
        ];
        // Validate if address is valid and not "0x0..."
        if (!tokenAddress || tokenAddress === '0x' || tokenAddress === ethers.ZeroAddress) return 0;

        const token = new ethers.Contract(tokenAddress, abi, p);
        const balance = await token.balanceOf(wallet.toLowerCase());
        const decimals = await token.decimals();
        return parseFloat(ethers.formatUnits(balance, decimals));
    } catch (err) {
        // Silently fail for mock/missing contracts during development
        return 0;
    }
}

async function getUSDCBalance(wallet) {
    return getTokenBalance(wallet, CONTRACTS.usdc);
}

async function getVESBalance(wallet) {
    return getTokenBalance(wallet, CONTRACTS.ves);
}

async function getEURCBalance(wallet) {
    return getTokenBalance(wallet, CONTRACTS.eurc);
}

async function isAnvilRunning() {
    try {
        await getProvider().getBlockNumber();
        return true;
    } catch {
        return false;
    }
}


// ============================================
// VAULT TOKEN REGISTRATION (Step 5 - Chainlink)
// ============================================

// Minimum StealthVaultEscrow ABI to register tokens and verify state
const VAULT_ABI = [
    'function registerToken(address token, address policyEngine) external',
    'function registeredTokens(address) view returns (address policyEngine, bool isRegistered)'
];

/**
 * Registers USDC in the Vault on server startup (Step 5 of Chainlink README).
 * It is idempotent: if the token was already registered (TX will revert or state indicates it),
 * it is silently ignored.
 */
async function initVaultTokens() {
    try {
        const p = getProvider();
        const signer = getDonSigner();
        const vault = new ethers.Contract(CONTRACTS.stealthVaultEscrow, VAULT_ABI, p);

        // Check if USDC is already registered (cheap read)
        const tokenState = await vault.registeredTokens(CONTRACTS.usdc);
        if (tokenState.isRegistered) {
            console.log('[Vault] ✅ USDC already registered in Vault. Skipping registerToken.');
            return;
        }

        console.log('[Vault] 📋 Registering USDC in Vault (Step 5 Chainlink)...');
        const vaultWrite = new ethers.Contract(CONTRACTS.stealthVaultEscrow, VAULT_ABI, signer);
        const tx = await vaultWrite.registerToken(CONTRACTS.usdc, ethers.ZeroAddress);
        const receipt = await tx.wait();
        console.log(`[Vault] ✅ USDC registered in block #${receipt.blockNumber} - TX: ${receipt.hash.slice(0, 18)}...`);
    } catch (err) {
        // Do not block server startup if it fails (network unavailable, etc.)
        console.warn('[Vault] ⚠️ Could not register USDC in Vault:', err.message);
    }
}

/**
 * Registers an RWA bond token in the Vault when an auction is created.
 * Bonds are born in Stage 2 with built-in ACE compliance,
 * so they are registered with the shared PolicyEngine.
 * @param {string} bondAddress - ERC-3643 bond contract address
 */
async function registerBondInVault(bondAddress) {
    if (!bondAddress || bondAddress === ethers.ZeroAddress) return false;
    try {
        const p = getProvider();
        const vault = new ethers.Contract(CONTRACTS.stealthVaultEscrow, VAULT_ABI, p);

        // Check if already registered
        const tokenState = await vault.registeredTokens(bondAddress);
        if (tokenState.isRegistered) {
            console.log(`[Vault] ✅ Bond ${bondAddress.slice(0, 10)}... already registered.`);
            return true;
        }

        const signer = getDonSigner();
        const vaultWrite = new ethers.Contract(CONTRACTS.stealthVaultEscrow, VAULT_ABI, signer);
        // RWA bonds use the Stage 1 PolicyEngine for transfer compliance
        const tx = await vaultWrite.registerToken(bondAddress, CONTRACTS.identityRegistry);
        const receipt = await tx.wait();
        console.log(`[Vault] ✅ Bond ${bondAddress.slice(0, 10)}... registered in block #${receipt.blockNumber}`);
        return true;
    } catch (err) {
        console.warn(`[Vault] ⚠️ Could not register bond ${bondAddress}:`, err.message);
        return false;
    }
}

// ============================================
// STAGE 6: REGULATORY REPORT ON-CHAIN STORAGE
// ============================================
// RegulatoryReportLedger.sol — Deployed by DeployStage6.s.sol
// Stores only hashes and public metadata (no sensitive data on-chain)

const REPORT_LEDGER_ADDRESS = '0x36b58f5c1969b7b6591d752ea6f5486d069010ab';

const REPORT_LEDGER_ABI = [
    'function storeReport(bytes32 reportHash, address reporter, bytes32 envelopeDigest) external',
    'function totalReports() view returns (uint256)',
    'function reportExists(bytes32 reportHash) view returns (bool)',
    'event RegulatoryReportSent(bytes32 indexed reportHash, address indexed regulator, address reporter, uint256 timestamp)'
];

/**
 * Stores a regulatory report hash on-chain for immutable auditability.
 * The RegulatoryReportLedger contract emits a RegulatoryReportSent event
 * that any auditor can verify without accessing the sensitive data.
 * 
 * @param {string} reportHash - The unique report hash (e.g., "0x01e2c4e691177003")
 * @param {string} reporterWallet - The pseudonymous wallet that triggered the report
 * @param {string} envelopeDigest - SHA-256 of the encrypted envelope (integrity check)
 * @returns {{ success: boolean, txHash?: string, blockNumber?: number }}
 */
async function storeReportOnChain(reportHash, reporterWallet, envelopeDigest) {
    try {
        const signer = getDonSigner();
        const ledger = new ethers.Contract(REPORT_LEDGER_ADDRESS, REPORT_LEDGER_ABI, signer);

        // Pad the report hash to bytes32 (Solidity expects 32 bytes)
        const hashBytes32 = ethers.zeroPadValue(
            ethers.toBeHex(reportHash.startsWith('0x') ? reportHash : `0x${reportHash}`, 32),
            32
        );

        // Create envelope digest as bytes32
        const digestBytes32 = ethers.zeroPadValue(
            ethers.toBeHex(envelopeDigest.startsWith('0x') ? envelopeDigest : `0x${envelopeDigest}`, 32),
            32
        );

        console.log(`[OnChain-Stage6] → Registering report ${reportHash.slice(0, 12)}... in RegulatoryReportLedger`);

        const tx = await ledger.storeReport(hashBytes32, reporterWallet, digestBytes32);
        const receipt = await tx.wait();

        const totalReports = await ledger.totalReports();
        console.log(`[OnChain-Stage6] ✅ Report registered in block #${receipt.blockNumber} | Total on-chain: ${totalReports}`);

        return { success: true, txHash: receipt.hash, blockNumber: Number(receipt.blockNumber) };
    } catch (err) {
        console.error(`[OnChain-Stage6] ⚠️ Error registering report on-chain:`, err.message);
        return { success: false, error: err.message };
    }
}

module.exports = {
    registerIdentityOnChain,
    isVerifiedOnChain,
    getUSDCBalance,
    getVESBalance,
    getEURCBalance,
    debitOnChain,
    isAnvilRunning,
    initVaultTokens,
    registerBondInVault,
    storeReportOnChain,
    REPORT_LEDGER_ADDRESS,
    CONTRACTS,
    ENTITY_TYPES
};
