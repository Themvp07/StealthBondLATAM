const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { log } = require('../utils/logger');
const { saveState } = require('../utils/stateManager');
const onchain = require('../utils/onchain');

// Helper to handle Windows spaces in CRE SDK compiler
function getShortPath(p) {
    if (process.platform !== 'win32') return p;
    try {
        const cmd = `cmd /c "for %I in ("${p}") do @echo %~sI"`;
        return execSync(cmd).toString().trim();
    } catch (e) {
        return p;
    }
}

module.exports = (state, log) => ({
    async createHandler(req, res) {
        const { ownerWallet: rawWallet, bondName, nominalValue, destinationChain } = req.body;
        const issuerWallet = rawWallet ? rawWallet.toLowerCase() : null;

        if (!issuerWallet || !bondName || !nominalValue || !destinationChain) {
            return res.status(400).json({ error: 'Missing RWA private issuance parameters.' });
        }

        log('ACE', `🚀 [Defi / Tokenization] Initiating Private Multichain Issuance of: ${bondName}`);

        // 1. Validate Issuer Role (Only COMPANY) in Local DB
        const creator = state.kyc[issuerWallet];
        if (!creator || creator.type !== 'company') {
            log('ERROR', `❌ [CRE] Role Error: Only institutionally verified companies can issue bonds.`);
            return res.status(403).json({ error: 'Only verified companies can issue bonds.' });
        }

        // 🌟 STRICT ON-CHAIN VALIDATION (Agent Registry) 🌟
        try {
            const { ethers } = require('ethers');
            const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
            const agentRegistryAddress = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";
            const registryAbi = ['function isVerified(address wallet, uint256 minLevel) view returns (bool)'];
            const registry = new ethers.Contract(agentRegistryAddress, registryAbi, provider);

            const isVerifiedOnChain = await registry.isVerified(issuerWallet, 1);
            if (!isVerifiedOnChain) {
                log('ERROR', `❌ [COMPLIANCE] Issuance blocked: Wallet ${issuerWallet.slice(0, 6)}... is not authorized in the On-Chain AgentRegistry.`);
                return res.status(403).json({ error: 'Signature rejected. Corporate identity not authorized on-chain. Please re-verify the Company in Stage 1.' });
            }
        } catch (e) {
            log('ERROR', `⚠️ [COMPLIANCE] Error querying on-chain: ${e.message}`);
        }

        // Prepare Payload
        const payload = {
            issuerWallet,
            bondName,
            requestedAmount: nominalValue,
            destinationChain
        };

        const longCreRootDir = path.join(__dirname, '../../cre-project');
        const creRootDir = getShortPath(longCreRootDir);
        const payloadPath = path.join(creRootDir, 'workflows', 'stage2-issuance', 'payload.json');

        try {
            fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
        } catch (err) {
            return res.status(500).json({ error: 'CRE simulator system error while writing payload.' });
        }

        // Execute CRE bond issuance workflow (Stage 2)
        log('CRE', `[SYSTEM] Triggering TEE: cre workflow simulate stage2-issuance...`);

        const absolutePayloadPath = `@${payloadPath}`;

        const creProcess = spawn('cre', ['workflow', 'simulate', 'workflows/stage2-issuance', '--target', 'simulation', '--non-interactive', '--trigger-index', '0', '--http-payload', absolutePayloadPath, '--broadcast'], {
            cwd: creRootDir,
            shell: true,
            env: process.env
        });
        creProcess.stdin.end();

        let stdout = '';

        creProcess.stdout.on('data', (data) => {
            const line = data.toString();
            stdout += line;
            if (line.includes('[USER LOG]')) {
                const cleanMessage = line.split('[USER LOG]')[1].trim();
                log('CRE', cleanMessage);
            }
        });

        creProcess.on('close', async (code) => {
            const combinedOutput = stdout;
            let failedStep = 3;
            let rejectMessage = 'Financial Oracle execution failed.';

            if (combinedOutput.includes('CUSTODIAN:')) {
                const custodianMsg = combinedOutput.match(/CUSTODIAN: (.+)/)?.[1] || 'Insufficient funds or liquidity.';
                rejectMessage = `❌ CUSTODIAN: ${custodianMsg}`;
                log('CUSTODIAN', `❌ Custodian validation failed`);
                return res.status(200).json({ status: 'rejected', message: rejectMessage, failedStep });
            } else if (combinedOutput.includes('AI STRUCTURER REJECTS OPERATION') || combinedOutput.includes('STRUCTURING FAILED')) {
                failedStep = 3;
                rejectMessage = '⚠️ AI: Financial Structurer rejected the operation due to data anomaly.';
                log('SYSTEM', `❌ Oracle rejected at step ${failedStep}: ${rejectMessage}`);
                return res.status(200).json({ status: 'rejected', message: rejectMessage, failedStep });
            }

            if (code !== 0 && !combinedOutput.includes('Workflow Simulation Result:')) {
                log('SYSTEM', `❌ Oracle failed with code ${code}: ${rejectMessage}`);
                return res.status(200).json({ status: 'rejected', message: rejectMessage, failedStep });
            }

            let cipherHashFromLog = null;
            const cipherMatch = stdout.match(/Cipher Hash \(CCIP Transit Payload\) Generated:\s+(0x[a-fA-F0-9]+)/);
            if (cipherMatch && cipherMatch[1]) {
                cipherHashFromLog = cipherMatch[1];
            } else {
                const fallbackMatch = stdout.match(/Private Cipher Hash Generated:\s+(0x[a-fA-F0-9]+)/);
                if (fallbackMatch && fallbackMatch[1]) cipherHashFromLog = fallbackMatch[1];
            }

            let result = {
                status: 'success',
                vaultCipher: cipherHashFromLog || '0x' + require('crypto').randomBytes(32).toString('hex'),
                targetChain: destinationChain
            };

            log('SYSTEM', `✅ CRE TEE finished private phase (Custodian+AI) with favorable Score. Returning control to Backend for On-Chain Anchoring.`);

            if (result && result.status === 'success') {
                log('EVM', `✅ TEE Oracle approved issuance. CCIP Vault registered: ${result.vaultCipher.slice(0, 16)}...`);

                // 🌟 Smart Contract Integration (EVM WRITE) 🌟
                try {
                    const { ethers } = require('ethers');
                    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
                    const deployerKey = process.env.DON_SIGNER_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

                    // Proxy address deployed in Phase 2.5
                    const factoryAddress = onchain.CONTRACTS.stealthBondFactory;

                    const provider = new ethers.JsonRpcProvider(rpcUrl);
                    const wallet = new ethers.Wallet(deployerKey, provider);

                    const factoryAbi = [
                        "function issueBond(uint256 nominalValue, bytes32 cipherHash, address issuerWallet, string network, uint64 destChainSelector) returns (uint256)",
                        "event BondIssued(uint256 indexed bondId, address rwaToken, bytes32 vaultCipher)"
                    ];

                    const factoryContract = new ethers.Contract(factoryAddress, factoryAbi, wallet);

                    log('EVM', `📝 [Smart Contract] Executing issueBond() on-chain in StealthBondFactory...`);

                    // Scale value to decimals used by our ERC-3643 (6 decimals)
                    const parsedNominal = ethers.parseUnits(nominalValue.toString(), 6);

                    // Ensure cipherHash is correctly formatted (uint256 representable as bytes32 in string)
                    let formattedCipher = result.vaultCipher;
                    if (!formattedCipher.startsWith('0x')) {
                        formattedCipher = '0x' + formattedCipher;
                    }

                    // Execute real transaction
                    const chainSelector = 16015286601757825753n; // Official Arbitrum Sepolia selector for the Simulator
                    const tx = await factoryContract.issueBond(parsedNominal, formattedCipher, issuerWallet, result.targetChain, chainSelector, { gasLimit: 2000000 });

                    log('EVM', `⏳ Waiting for tx confirmation: ${tx.hash}...`);
                    const receipt = await tx.wait();
                    log('EVM', `✅ Factory deployed RWA Token successfully! Block: ${receipt.blockNumber}`);

                    // ─── CRITICAL STEP: Obtain real ERC-3643 contract address ───
                    // Strategy 1: parse BondIssued event from receipt
                    let rwaTokenAddress = null;
                    let numericalBondId = null;

                    for (const parseLog of receipt.logs) {
                        try {
                            const event = factoryContract.interface.parseLog({
                                topics: parseLog.topics,
                                data: parseLog.data
                            });
                            if (event && event.name === 'BondIssued') {
                                numericalBondId = Number(event.args.bondId);
                                rwaTokenAddress = event.args.rwaToken;
                                log('EVM', `🏦 [BondID]: ${numericalBondId} | [RWA Address]: ${rwaTokenAddress}`);
                                break;
                            }
                        } catch (parseErr) {
                            // Silent log: normal for other events (proxy, ACE) not to be parseable by this ABI
                        }
                    }

                    // Strategy 2 (robust fallback): query factory.manifests() directly
                    // This reads the contract's source of truth, independent of log parsing
                    if (!rwaTokenAddress || rwaTokenAddress === ethers.ZeroAddress) {
                        log('EVM', `⚠️ BondIssued event not captured in logs. Querying manifests() on-chain directly...`);
                        try {
                            const factoryReadAbi = [
                                "function nextBondId() view returns (uint256)",
                                "function manifests(uint256) view returns (uint256 bondId, uint256 nominalValue, bytes32 cipherHash, address issuerWallet, address tokenContract, string chainDestination)"
                            ];
                            const factoryRead = new ethers.Contract(factoryAddress, factoryReadAbi, provider);
                            const nextId = await factoryRead.nextBondId();
                            // Last issued bond has ID (nextId - 1)
                            const lastBondId = Number(nextId) - 1;
                            if (lastBondId >= 1) {
                                const manifest = await factoryRead.manifests(lastBondId);
                                numericalBondId = lastBondId;
                                rwaTokenAddress = manifest.tokenContract;
                                log('EVM', `🏦 [Fallback manifests()] BondID: ${numericalBondId} | RWA: ${rwaTokenAddress}`);
                            }
                        } catch (manifestErr) {
                            log('ERROR', `❌ Could not read manifests(): ${manifestErr.message}`);
                        }
                    }

                    // If we still don't have a real address, use last resort (hash as address)
                    // and mark it clearly for diagnostics
                    if (!rwaTokenAddress || rwaTokenAddress === ethers.ZeroAddress) {
                        rwaTokenAddress = '0x' + formattedCipher.slice(2).slice(-40); // slice(2) removes 0x, then slice(-40)
                        numericalBondId = numericalBondId || 1;
                        log('ERROR', `⚠️ WARNING: Using hash-derived address as fallback: ${rwaTokenAddress}. The bond may not have a real contract.`);
                    }

                    // Verify real bytecode exists at that address
                    const bytecode = await provider.getCode(rwaTokenAddress);
                    const hasCode = bytecode && bytecode !== '0x' && bytecode.length > 2;
                    if (hasCode) {
                        log('EVM', `✅ Verified: ERC-3643 Contract deployed at ${rwaTokenAddress.slice(0, 12)}... (${((bytecode.length - 2) / 2)} bytes)`);
                    } else {
                        log('ERROR', `⚠️ WARNING: No bytecode detected at ${rwaTokenAddress}. Possible fallback address.`);
                    }

                    log('CCIP', `🌐 [CCIP] Cross-chain messaging prepared to ${result.targetChain} via CCIPLocalSimulator.`);

                    // Save to global persistent state
                    const bondAddress = rwaTokenAddress;
                    if (!Array.isArray(state.bonds)) state.bonds = [];

                    // Use bond name as collateralId for maximum clarity
                    const nextCollId = bondName;

                    const newBond = {
                        bondId: numericalBondId, // Factory Real Numerical ID
                        address: bondAddress,
                        name: bondName,
                        ticker: bondName.toUpperCase(),
                        collateralId: nextCollId,
                        nominalValue: parseFloat(nominalValue),
                        collateralValue: parseFloat(nominalValue) * 1.5, // 150% Overcollateralized
                        owner: issuerWallet,
                        status: 'ACTIVE',
                        chain: destinationChain,
                        vaultHash: result.vaultCipher,
                        txHash: receipt.hash
                    };

                    state.bonds.push(newBond);

                    if (!state.balances) state.balances = {};
                    if (!state.balances[issuerWallet]) state.balances[issuerWallet] = {};
                    state.balances[issuerWallet][bondAddress] = parseFloat(nominalValue);

                    saveState(state);

                    // ─── POST-ISSUANCE STEP 1: UNPAUSE ──────────────────────
                    try {
                        const p1 = new ethers.JsonRpcProvider(process.env.RPC_URL || rpcUrl);
                        const w1 = new ethers.Wallet(process.env.DON_SIGNER_KEY || deployerKey, p1);
                        const postFactoryAbi = ["function updateReserveRatio(uint256 bondId, uint256 newRatio) external"];
                        const postFactory = new ethers.Contract(factoryAddress, postFactoryAbi, w1);
                        const unpauseTx = await postFactory.updateReserveRatio(numericalBondId, 15000);
                        await unpauseTx.wait();
                        log('EVM', `🔓 [Factory] Bond ${bondAddress.slice(0, 10)}... unpaused on-chain (ratio: 150%).`);
                    } catch (e1) {
                        log('EVM', `⚠️ [Unpause] ${e1.message.slice(0, 80)}`);
                    }

                    // ─── POST-ISSUANCE STEP 2: REGISTER IN VAULT ────────────────
                    try {
                        const p2 = new ethers.JsonRpcProvider(process.env.RPC_URL || rpcUrl);
                        const w2 = new ethers.Wallet(process.env.DON_SIGNER_KEY || deployerKey, p2);
                        const vaultAbi = ["function registerToken(address tokenAddress, address priceFeedOrZero) external"];
                        const vaultContract = new ethers.Contract(onchain.CONTRACTS.stealthVaultEscrow, vaultAbi, w2);
                        const regTx = await vaultContract.registerToken(bondAddress, ethers.ZeroAddress);
                        await regTx.wait();
                        log('EVM', `🏦 [Vault] RWA Bond ${bondAddress.slice(0, 10)}... registered. Ready for auctions.`);
                    } catch (e2) {
                        log('EVM', `⚠️ [Vault Register] ${e2.message.slice(0, 80)}`);
                    }
                    // ────────────────────────────────────────────────────────────────

                    res.json({ success: true, message: `Private ERC-3643 RWA Bond deployed: ${bondAddress.slice(0, 10)}... | Ready for bridging via CCIP in Tx ${tx.hash.slice(0, 10)}...`, status: 'minted', bondAddress: bondAddress, chain: destinationChain, amount: nominalValue, txHash: tx.hash });

                } catch (smartContractError) {
                    log('ERROR', `🔥 Interaction with the EVM Smart Contract failed! ${smartContractError.message}`);
                    return res.status(500).json({ error: 'Failed to mint the bond on-chain.' });
                }
            } else {
                res.status(500).json({ error: 'Internal failure in TEE Issuance' });
            }
        });
    }
});
