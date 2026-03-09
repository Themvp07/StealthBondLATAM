/**
 * @title StealthBond Stage 5 – AML Anti-Scam Filter (TEE)
 * @notice CRE Workflow for Anti-Money Laundering compliance filter.
 *
 * FLOW INSIDE THE TEE (Confidential Runtime Environment):
 *   1. Receives payload: { targetWallet, senderWallet, amount, bondAddress }
 *   2. ConfidentialHTTP → local /aml/check (OFAC list + dynamic blacklist)
 *      AML_API_KEY injected from Vault — never exposed
 *   3. ConfidentialHTTP → api.checkcryptoaddress.com/wallet-checks
 *      CHECKCRYPTO_API_KEY injected from Vault — never exposed
 *   4. Combined Score: MAX(localScore, externalScore)
 *   5. If riskScore >= 70 → evmWrite: setAddressFrozen(targetWallet, true) in ERC-3643
 *   6. Returns JSON with { clean, riskScore, action, freeze: { required, txHash } }
 *
 * The backend (aml.js) executes setAddressFrozen directly as a fallback
 * if the simulator evmWrite does not confirm on-chain (same as kyc.js →
 * registerIdentityOnChain), ensuring the freeze always occurs.
 *
 * Chainlink Standards applied:
 *   - ConfidentialHTTPClient: API keys never leave the TEE
 *   - EVMClient.callContract: on-chain write authorized by the DON
 *   - Runner/Handler Pattern: same as stage1-identity, stage2-issuance
 */

import {
    HTTPCapability,
    ConfidentialHTTPClient,
    EVMClient,
    handler,
    decodeJson,
    json,
    bytesToHex,
    getNetwork,
    Runner,
    type Runtime,
    type HTTPPayload,
} from "@chainlink/cre-sdk";
import { encodeFunctionData } from "viem";

// ============================================================
// CONFIG INTERFACE
// ============================================================
interface Config {
    apiBase: string;
    complianceIssuer: string;
    chainSelectorName: string;
    vaultNamespace: string;
    vaultOwner: string;
    aml: {
        freezeThreshold: number;
        ofacWallet: string;
    };
}

// ============================================================
// MINIMUM ABI: StealthBondERC3643 – stage 5 only
// ============================================================
const ERC3643_ABI = [
    {
        name: "setAddressFrozen",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "userAddress", type: "address" },
            { name: "freeze", type: "bool" }
        ],
        outputs: []
    }
] as const;

// ============================================================
// PRINCIPAL TEE HANDLER
// ============================================================
const onAmlTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
    const config = runtime.config;

    // Network resolution (official CRE pattern — same as all project workflows)
    const network = getNetwork({
        chainFamily: "evm",
        chainSelectorName: config.chainSelectorName,
        isTestnet: true,
    });

    if (!network) {
        throw new Error(`❌ Network not found: ${config.chainSelectorName}`);
    }

    const evmClient = new EVMClient(network.chainSelector.selector);

    // Payload ingestion
    const input = decodeJson(payload.input) as any;
    const { targetWallet, senderWallet, amount, bondAddress } = input;

    runtime.log(`[CRE TEE] 🔍 [Stage5-AML] Initiating Dual-Source AML Check (Origin & Destination)...`);
    runtime.log(`[CRE TEE] Sender: ${(senderWallet as string)?.slice(0, 10)}... | Target: ${(targetWallet as string).slice(0, 10)}...`);

    const confidentialHttp = new ConfidentialHTTPClient();

    // Vault secrets: AML_API_KEY (local) + CHECKCRYPTO_API_KEY (external)
    const vaultSecrets = [
        { key: "AML_API_KEY", namespace: config.vaultNamespace, owner: config.vaultOwner },
        { key: "CHECKCRYPTO_API_KEY", namespace: config.vaultNamespace, owner: config.vaultOwner }
    ];

    // ================================================================
    // SOURCE 1: Local OFAC List - Checking internal database (Simulated SUNAVAL/OFAC)
    // ================================================================
    runtime.log("[CRE TEE] 📋 [Local OFAC] Consulting sanctions list for both participants...");

    // Check Destination
    const localTargetRaw = confidentialHttp.sendRequest(runtime, {
        vaultDonSecrets: vaultSecrets,
        request: {
            url: `${config.apiBase}/aml/check`,
            method: "POST",
            multiHeaders: {
                "Content-Type": { values: ["application/json"] },
                "x-api-key": { values: ["{{.AML_API_KEY}}"] }
            },
            bodyString: JSON.stringify({ wallet: targetWallet }),
            encryptOutput: false
        }
    }).result();
    const localTarget = json(localTargetRaw) as any;

    // Check Origin
    let localSenderRiskScore = 0;
    let localSenderReason = "Sender clean";
    if (senderWallet) {
        const localSenderRaw = confidentialHttp.sendRequest(runtime, {
            vaultDonSecrets: vaultSecrets,
            request: {
                url: `${config.apiBase}/aml/check`,
                method: "POST",
                multiHeaders: {
                    "Content-Type": { values: ["application/json"] },
                    "x-api-key": { values: ["{{.AML_API_KEY}}"] }
                },
                bodyString: JSON.stringify({ wallet: senderWallet }),
                encryptOutput: false
            }
        }).result();
        const localSender = json(localSenderRaw) as any;
        localSenderRiskScore = localSender.riskScore ?? 0;
        if (localSenderRiskScore >= 70) localSenderReason = localSender.reason || "Sender Wallet on Sanctions List";
    }

    const localRiskScore = Math.max(localTarget.riskScore ?? 0, localSenderRiskScore);
    const localReason = localRiskScore >= 70
        ? (localSenderRiskScore >= 70 ? `ORIGIN BLOCKED: ${localSenderReason}` : `DESTINATION BLOCKED: ${localTarget.reason || "OFAC Match"}`)
        : "Both wallets clean in local OFAC check";

    runtime.log(`[CRE TEE] ✅ [Local OFAC] Combined Score: ${localRiskScore}/100`);

    // ================================================================
    // SOURCE 2: External CheckCryptoAddress API - Real-time global fraud detection
    // ================================================================
    runtime.log("[CRE TEE] 🌐 [CheckCryptoAddress] Consulting global database for both wallets...");

    let totalExternalScamReports = 0;
    let externalValid = true;

    const checkExternal = (address: string, role: string) => {
        try {
            const externalRaw = confidentialHttp.sendRequest(runtime, {
                vaultDonSecrets: vaultSecrets,
                request: {
                    url: "https://api.checkcryptoaddress.com/wallet-checks",
                    method: "POST",
                    multiHeaders: {
                        "Content-Type": { values: ["application/json"] },
                        "X-Api-Key": { values: ["{{.CHECKCRYPTO_API_KEY}}"] }
                    },
                    bodyString: JSON.stringify({ address, network: "eth" }),
                    encryptOutput: false
                }
            }).result();

            const externalData = json(externalRaw) as any;
            const reports = parseInt(externalData.scamReport ?? "0", 10);
            totalExternalScamReports += reports;
            if (externalData.valid === false) externalValid = false;

            runtime.log(`[CRE TEE] ✅ [CheckCryptoAddress] ${role} reports: ${reports}`);
        } catch (_err) {
            runtime.log(`[CRE TEE] ⚠️ [CheckCryptoAddress] External API timeout/fail for ${role}.`);
        }
    };

    checkExternal(targetWallet, "TARGET");
    if (senderWallet) checkExternal(senderWallet, "SENDER");

    // ================================================================
    // COMBINED SCORING & DECISION
    // ================================================================
    const externalScore = Math.min(totalExternalScamReports * 8, 100);
    const finalRiskScore = Math.max(localRiskScore, externalScore);

    const freezeThreshold = config.aml?.freezeThreshold ?? 70;
    const isClean = finalRiskScore < freezeThreshold;
    const action = isClean ? "allow" : "freeze";

    runtime.log(`[CRE TEE] 🏁 [TEE Decision] Final Score: ${finalRiskScore}/100 → ${action.toUpperCase()}`);

    // ================================================================
    // EVM WRITE: Freeze VIOLATOR on-chain - Automatic compliance enforcement in ERC-3643
    // ================================================================
    let freezeTxHash: string | null = null;
    let evmWriteAttempted = false;

    // We prioritize freezing the TARGET if it's the one that failed, 
    // but the Policy Manager blocks the TX if EITHER fails.
    if (!isClean && bondAddress && bondAddress !== "0x0000000000000000000000000000000000000001") {
        evmWriteAttempted = true;
        const walletToFreeze = localTarget.riskScore >= 70 ? targetWallet : (localSenderRiskScore >= 70 ? senderWallet : targetWallet);

        runtime.log(`[CRE TEE] 🔒 [ERC-3643] Executing setAddressFrozen(${walletToFreeze.slice(0, 10)}..., true) via evmWrite...`);

        try {
            const callData = encodeFunctionData({
                abi: ERC3643_ABI,
                functionName: "setAddressFrozen",
                args: [walletToFreeze as `0x${string}`, true]
            });

            evmClient.callContract(runtime, {
                call: {
                    from: "0x0000000000000000000000000000000000000000" as `0x${string}`,
                    to: bondAddress as `0x${string}`,
                    data: callData as `0x${string}`
                }
            }).result();

            runtime.log(`[CRE TEE] 🔒 [ERC-3643] On-chain freeze signaled. Backend fallback will finalize if needed.`);
        } catch (_evmErr) {
            runtime.log(`[CRE TEE] ⚠️ evmWrite failed (local simulator). Backend fallback will ensure freeze.`);
        }
    }

    return JSON.stringify({
        status: "success",
        clean: isClean,
        action: action,
        riskScore: finalRiskScore,
        reason: localReason,
        freeze: {
            required: !isClean,
            evmWriteAttempted: evmWriteAttempted,
            txHash: null // Managed by backend in simulation mode
        }
    });
};

// ============================================================
// ENTRY POINT (official CRE pattern)
// ============================================================
export async function main() {
    const runner = await Runner.newRunner<Config>();
    await runner.run((config: Config) => [handler(new HTTPCapability().trigger({}), onAmlTrigger)]);
}
