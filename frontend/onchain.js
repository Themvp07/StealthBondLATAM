// ============================================
// StealthBond LATAM – On-Chain Bridge (Ethers.js v6)
// Connects MetaMask to deployed contracts on Anvil
// ============================================

const CONTRACT_ADDRESSES = {
    creComplianceIssuer: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    identityRegistry: '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9',
    agentRegistry: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    keystoneForwarder: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    usdc: '0x68b1d87f95878fe05b998f19b66f4baba5de1aed',  // Stealth USDC (same as backend)
    stealthBondFactory: '0x5eb3bc0a489c5a8288765d2336659ebca68fcd00',
    stealthVaultEscrow: '0xdc11f7e700a4c898ae5caddb1082cffa76512add'
};

const ANVIL_CHAIN = {
    chainId: '0x7A69',  // 31337 in hex
    chainName: 'Anvil (Local)',
    rpcUrls: ['http://127.0.0.1:8545'],
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
};

const BASE_SEPOLIA_CHAIN = {
    chainId: '0x14A34', // 84532 in hex
    chainName: 'Base Sepolia',
    rpcUrls: ['https://sepolia.base.org'],
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://sepolia.basescan.org']
};

// ABIs (only the functions we need)
const REGISTRY_ABI = [
    'function registry(address) view returns (uint8 entityType, bytes32 ccid, address tutor, uint256 level, bool active)',
    'function isVerified(address wallet, uint256 minLevel) view returns (bool)',
    'function forwarder() view returns (address)',
    'function onReport(bytes calldata, bytes calldata reportPayload) external'
];

const FORWARDER_ABI = [
    'function donSigner() view returns (address)',
    'function targetRegistry() view returns (address)',
    'function report(address, bytes, bytes, bytes[]) external'
];

/**
 * Robust address validation to prevent calls to undefined/null addresses.
 */
function isValidAddress(addr) {
    return addr &&
        typeof addr === 'string' &&
        addr.startsWith('0x') &&
        addr.length === 42 &&
        addr !== '0x0000000000000000000000000000000000000000';
}

/**
 * Safety wrapper for ethers.Contract instantiation.
 */
function safeContract(address, abi, providerOrSigner) {
    if (!isValidAddress(address)) {
        console.error('🚨 [OnChain] Attempt to create contract with invalid address:', address, new Error().stack);
        return null;
    }
    return new ethers.Contract(address, abi, providerOrSigner);
}

// Contract constructor interceptor with global tracking
window.__DEBUG_CONTRACTS = [];
const OriginalContract = ethers.Contract;
ethers.Contract = function (address, abi, runner) {
    const stack = new Error().stack;
    const info = { address, timestamp: new Date().toISOString(), stack };
    window.__DEBUG_CONTRACTS.push(info);

    if (!isValidAddress(address)) {
        console.error('🚨 [CRITICAL] Contract instantiation with INVALID address!', address, stack);
    } else {
        console.log('🛡️ [Debug] Contract instantiated at:', address);
    }
    return new OriginalContract(address, abi, runner);
};
// Maintain compatibility with ethers.Contract statics
Object.setPrototypeOf(ethers.Contract, OriginalContract);

// ============================================
// WALLET CONNECTION
// ============================================

/**
 * Connects MetaMask and ensures the user is on the Anvil network.
 * Returns { provider, signer, address } or null on failure.
 */
async function connectMetaMask() {
    if (!window.ethereum) {
        console.warn('MetaMask not detected');
        return null;
    }

    try {
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (!accounts || accounts.length === 0) return null;

        // Switch to Anvil network
        await switchToAnvil();

        const provider = new ethers.BrowserProvider(window.ethereum);

        // DEBUG INTERCEPTOR (Catches 'to: None')
        const originalCall = provider.call;
        provider.call = async function (tx, blockTag) {
            if (!tx.to || tx.to === '0x' || tx.to === ethers.ZeroAddress) {
                console.error('🚨 INVALID CALL DETECTED (to: None)', tx, new Error().stack);
                throw new Error('Preventing call to null address that would crash Anvil');
            }
            return originalCall.apply(this, [tx, blockTag]);
        };

        const signer = await provider.getSigner();
        const address = await signer.getAddress();

        console.log(`[OnChain] Connected: ${address}`);
        return { provider, signer, address };
    } catch (err) {
        console.error('[OnChain] Connection failed:', err);
        return null;
    }
}

/**
 * Asks MetaMask to switch to the Anvil local network.
 * If the network doesn't exist, adds it first.
 */
async function switchToAnvil() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ANVIL_CHAIN.chainId }]
        });
    } catch (switchError) {
        // Chain not added yet — add it
        if (switchError.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [ANVIL_CHAIN]
            });
        } else {
            throw switchError;
        }
    }
}

async function switchToBaseSepolia() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_SEPOLIA_CHAIN.chainId }]
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [BASE_SEPOLIA_CHAIN]
            });
        } else {
            throw switchError;
        }
    }
}

async function transferUSDCBaseSepolia(to, amount) {
    const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const ABI = ["function transfer(address to, uint256 amount) returns (bool)"];

    await switchToBaseSepolia();
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(USDC_BASE_SEPOLIA, ABI, signer);

    // USDC on Base Sepolia has 6 decimals
    const amountRaw = ethers.parseUnits(amount.toString(), 6);
    const tx = await contract.transfer(to, amountRaw);
    return tx;
}

// ============================================
// CONTRACT READS
// ============================================

/**
 * Checks if a wallet is verified on-chain in the AgentRegistry.
 * @param {string} walletAddress
 * @param {number} minLevel (default 1)
 * @returns {{ verified: boolean, entityType: number, ccid: string, level: number }}
 */
async function checkOnChainIdentity(walletAddress, minLevel = 1) {
    const cleanAddr = walletAddress ? walletAddress.toLowerCase() : null;
    if (!cleanAddr) {
        return { verified: false, entityType: 0, ccid: '0x', level: 0, active: false };
    }
    try {
        console.log(`[OnChain] Checking identity (direct RPC) for: ${cleanAddr}`);

        // USE DIRECT RPC — Do not use MetaMask (BrowserProvider) for reads.
        // MetaMask caches eth_call results and returns stale state
        // for several seconds after a TX is mined.
        // JsonRpcProvider always queries the node directly and sees the real state.
        const directProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

        const registry = new ethers.Contract(
            CONTRACT_ADDRESSES.agentRegistry,
            REGISTRY_ABI,
            directProvider
        );

        const verified = await registry.isVerified(cleanAddr, minLevel);
        const identity = await registry.registry(cleanAddr);

        return {
            verified,
            entityType: Number(identity.entityType),
            ccid: identity.ccid,
            tutor: identity.tutor,
            level: Number(identity.level),
            active: identity.active
        };
    } catch (err) {
        console.warn('[OnChain] Failed to read AgentRegistry:', err);
        return { verified: false, entityType: 0, ccid: '0x', level: 0, active: false };
    }
}

// Entity type mapping
const ENTITY_TYPES = ['NONE', 'PERSON', 'COMPANY', 'AI_AGENT'];

/**
 * Returns a human-readable label for an entity type number.
 */
function entityTypeLabel(typeNum) {
    return ENTITY_TYPES[typeNum] || 'UNKNOWN';
}

// ============================================
// METAMASK ACCOUNT CHANGE LISTENER
// ============================================
function setupMetaMaskListeners(onAccountChange) {
    if (!window.ethereum) return;

    window.ethereum.on('accountsChanged', (accounts) => {
        const newAddr = accounts[0] || null;
        console.log(`[OnChain] Account changed: ${newAddr}`);
        if (onAccountChange) onAccountChange(newAddr);
    });

    window.ethereum.on('chainChanged', () => {
        // [Stage 4 FIX] Removed automatic reload().
        // The x402 flow requires switching to Base Sepolia and back without refreshing the page,
        // otherwise analysis state and connection are lost.
        console.log('[OnChain] Network changed. Avoiding reload to preserve x402 session.');
        // window.location.reload(); 
    });
}

// ============================================
// STAGE 5 (AML Anti-Scam)
// ============================================

/**
 * On-chain pre-check to know if a wallet is frozen in the ERC-3643 bond contract.
 * Uses direct JsonRpcProvider to avoid MetaMask stale cache.
 * @param {string} bondAddress - StealthBondERC3643 address
 * @param {string} walletAddress - Wallet to verify
 * @returns {boolean} true if frozen
 */
async function isBondAddressFrozen(bondAddress, walletAddress) {
    if (!isValidAddress(bondAddress) || !isValidAddress(walletAddress)) return false;
    try {
        const directProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        const bytecode = await directProvider.getCode(bondAddress);
        if (!bytecode || bytecode === '0x' || bytecode.length <= 2) return false;

        const ERC3643_ABI = ['function isFrozen(address) view returns (bool)'];
        const bond = new ethers.Contract(bondAddress, ERC3643_ABI, directProvider);
        return await bond.isFrozen(walletAddress.toLowerCase());
    } catch (err) {
        console.warn('[OnChain E5] isFrozen failed:', err.message);
        return false;
    }
}

/**
 * Get on-chain balance of RWA token (ERC-3643).
 * Follows the same direct JsonRpcProvider pattern.
 */
async function getBondBalanceOnChain(bondAddress, walletAddress) {
    if (!isValidAddress(bondAddress) || !isValidAddress(walletAddress)) return 0;
    try {
        const directProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        const bytecode = await directProvider.getCode(bondAddress);
        if (!bytecode || bytecode === '0x' || bytecode.length <= 2) return 0;

        const ERC3643_ABI = [
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)'
        ];
        const bond = new ethers.Contract(bondAddress, ERC3643_ABI, directProvider);
        const [bal, decimals] = await Promise.all([
            bond.balanceOf(walletAddress),
            bond.decimals()
        ]);
        return parseFloat(ethers.formatUnits(bal, decimals));
    } catch (err) {
        console.warn('[OnChain E5] balance failed:', err.message);
        return 0;
    }
}

// ============================================
// EXPORTS (global for non-module usage)
// ============================================
window.onchain = {
    CONTRACT_ADDRESSES,
    ANVIL_CHAIN,
    connectMetaMask,
    switchToAnvil,
    checkOnChainIdentity,
    isValidAddress,
    safeContract,
    entityTypeLabel,
    setupMetaMaskListeners,
    ENTITY_TYPES,
    isBondAddressFrozen,
    getBondBalanceOnChain,
    switchToBaseSepolia,
    transferUSDCBaseSepolia
};
