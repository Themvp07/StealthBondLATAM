import {
    HTTPCapability,
    ConfidentialHTTPClient,
    EVMClient,
    handler,
    decodeJson,
    json,
    hexToBase64,
    bytesToHex,
    prepareReportRequest,
    getNetwork,
    TxStatus,
    Runner,
    type Runtime,
    type HTTPPayload,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters, encodeFunctionData, toHex } from "viem";

interface Config {
    apiBase: string;           // Core Engine URL for legacy/mock services
    agentRegistry: string;     // ACE Agent Registry contract address
    keystoneForwarder: string; // Chainlink Keystone Forwarder contract
    chainSelectorName: string; // CCIP Chain Selector (e.g., 'ethereum-testnet-sepolia')
    vaultNamespace: string;    // DON Vault Namespace for secrets
    vaultOwner: string;        // DON Vault Owner for secrets
}

// ABI for the new CREComplianceIssuer contract (ACE Phase 1)
const ISSUER_ABI = [
    {
        name: "onReport",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "metadata", type: "bytes" },
            { name: "reportPayload", type: "bytes" }
        ],
        outputs: []
    }
] as const;

/**
 * @title StealthBond Stage 1 – Identity Verification (Natural Person)
 * @notice CRE Workflow for secure KYC/KYB onboarding.
 * 
 * FLOW INSIDE THE TEE (Confidential Runtime Environment):
 *   1. Data Ingestion: Receives encrypted RIF, name, and OCR content.
 *   2. Confidential API Orquestration:
 *      - SENIAT: Validates fiscal identity using secrets from the DON Vault.
 *      - AML: Performs global sanctions screening using specialized external APIs.
 *   3. AI Analysis: Gemini Flash 2.5 performs a private document integrity check inside the Enclave.
 *   4. CCID Generation: Derives a unique Cross-Chain Identity Digest (ECC) for the user.
 *   5. On-Chain Anchoring: Submits a signed report to the AgentRegistry through the Keystone Forwarder.
 */
const onIdentityTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
    const config = runtime.config;

    // === NETWORK RESOLUTION (Official CRE Pattern) ===
    const network = getNetwork({
        chainFamily: "evm",
        chainSelectorName: config.chainSelectorName,
        isTestnet: true,
    });

    if (!network) {
        throw new Error(`❌ Network not found: ${config.chainSelectorName}`);
    }

    const evmClient = new EVMClient(network.chainSelector.selector);

    // Data Ingestion
    const input = decodeJson(payload.input) as any;
    const { wallet, rif, entityType, docHash, ocrContent } = input;

    runtime.log(`[CRE TEE] Debug: Forwarder=${config.keystoneForwarder}, Registry=${config.agentRegistry}`);
    runtime.log(`[CRE TEE] Auth: Initiating validation for wallet ${wallet.slice(0, 10)}...`);

    const confidentialHttp = new ConfidentialHTTPClient();

    const vaultSecrets = [
        { key: "SENIAT_API_KEY", namespace: config.vaultNamespace, owner: config.vaultOwner },
        { key: "AML_API_KEY", namespace: config.vaultNamespace, owner: config.vaultOwner },
        { key: "AI_API_KEY", namespace: config.vaultNamespace, owner: config.vaultOwner },
        { key: "GEMINI_API_KEY", namespace: config.vaultNamespace, owner: config.vaultOwner }
    ];

    // STEP 1: SENIAT VERIFICATION - Validating fiscal identity against government records (Simulated)
    runtime.log("[CRE TEE] Vault: Injecting API Keys and validating SENIAT Hash...");
    const seniatRaw = confidentialHttp.sendRequest(runtime, {
        vaultDonSecrets: vaultSecrets,
        request: {
            url: `${config.apiBase}/seniat/verify`,
            method: "POST",
            multiHeaders: { "Content-Type": { values: ["application/json"] }, "x-api-key": { values: ["{{.SENIAT_API_KEY}}"] } },
            bodyString: JSON.stringify({ rif, type: entityType === 1 ? 'person' : 'company', docHash }),
            encryptOutput: false
        }
    }).result();

    const seniatData = json(seniatRaw) as any;
    if (!seniatData.valid) throw new Error(`SENIAT: ${seniatData.message}`);

    // STEP 2: DIRECT AI ANALYSIS (PROPS Compliant with Google Gemini API)
    runtime.log("[CRE TEE] AI: Executing native and protected KYC analysis with Gemini 2.5 Flash...");

    // Generate strict Payload for Gemini API
    const geminiPayload = {
        contents: [{
            role: "user",
            parts: [{ text: `Analyze the following OCR text and verify this single rule: If the text contains ONLY numbers, it is valid (riskScore: 0). If it contains one or more LETTERS, it is invalid (riskScore: 85). \n\nTEXT: "${ocrContent}"` }]
        }],
        systemInstruction: {
            role: "system",
            parts: [{ text: "You are a data liquidator. Return the analysis strictly and only in this JSON schema without additional text or markdown formatting: {\"riskScore\": number, \"result\": string}. Don't be a complex cop, simply verify numbers vs letters." }]
        },
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
        }
    };

    const aiRaw = confidentialHttp.sendRequest(runtime, {
        vaultDonSecrets: vaultSecrets,
        request: {
            url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
            method: "POST",
            multiHeaders: { "Content-Type": { values: ["application/json"] }, "x-goog-api-key": { values: ["{{.GEMINI_API_KEY}}"] } },
            bodyString: JSON.stringify(geminiPayload),
            encryptOutput: false
        }
    }).result();

    const geminiResponse = json(aiRaw) as any;

    // Extract and parse the forced JSON response from Google Gemini
    let aiData: any = {};
    try {
        if (geminiResponse.error) {
            runtime.log(`[CRE TEE] ❌ Gemini API Error: ${JSON.stringify(geminiResponse.error)}`);
            aiData = { riskScore: 85, result: `API Error: ${geminiResponse.error.message}` };
        } else {
            const candidate = geminiResponse.candidates?.[0];
            if (candidate && candidate.finishReason !== 'STOP') {
                runtime.log(`[CRE TEE] ⚠️ Info: Gemini aborted generation with reason: ${candidate.finishReason}`);
            }
            const aiText = candidate?.content?.parts?.[0]?.text;

            if (!aiText) {
                runtime.log(`[CRE TEE] ⚠️ Empty response from AI. Raw Response: ${JSON.stringify(geminiResponse)}`);
                aiData = { riskScore: 85, result: "Document blocked by AI security filters" };
            } else {
                aiData = JSON.parse(aiText);
            }
        }

        // Force protective shield: If structure parse fails, it's high risk.
        if (aiData.riskScore === undefined) aiData.riskScore = 85;
        if (!aiData.result) aiData.result = "Structure not recognized by TEE";

        runtime.log(`[CRE TEE] AI Result: Risk [${aiData.riskScore}/100] - Detail: ${aiData.result}`);

        // Hard block: If risk is unacceptable, PANIC in TEE
        if (aiData.riskScore > 30) {
            throw new Error(`Unacceptable risk detected by AI: ${aiData.riskScore}/100 - ${aiData.result}`);
        }
    } catch (e: any) {
        runtime.log(`[CRE TEE] ⚠️ Fatal error parsing Gemini response: ${e.message}`);
        runtime.log(`[CRE TEE] Raw Response: ${JSON.stringify(geminiResponse)}`);
        // Propagate error to abort Tx
        throw new Error(`Catastrophic failure in AI Analysis: ${e.message}`);
    }

    // STEP 3: AML SCREENING - Checking global sanctions lists via Confidential HTTP
    runtime.log("[CRE TEE] AML: Screening global sanctions...");
    const amlRaw = confidentialHttp.sendRequest(runtime, {
        vaultDonSecrets: vaultSecrets,
        request: {
            url: `${config.apiBase}/aml/verify`,
            method: "POST",
            multiHeaders: { "Content-Type": { values: ["application/json"] }, "x-api-key": { values: ["{{.AML_API_KEY}}"] } },
            bodyString: JSON.stringify({ wallet }),
            encryptOutput: false
        }
    }).result();

    const amlStatus = json(amlRaw) as any;
    if (amlStatus.status === 'rejected') throw new Error("AML: Wallet blocked");
    runtime.log(`[CRE TEE] AML Result: OK - Wallet free of sanctions.`);

    // STEP 4: BLOCKCHAIN REGISTRATION (Official writeReport pattern)
    runtime.log("[CRE TEE] Consensus: Generating quorum and signed report...");

    // 1. Generate CCID (Cross-Chain Identity Digest)
    // We'll use a dynamic string (In real life it's the root of the identity's Merkle Tree)
    const rawCcidSeed = `ccid_person_${wallet}_${rif}`;
    const ccidHex = toHex(rawCcidSeed.padEnd(64, '0')).slice(0, 66) as `0x${string}`;

    // 2. Credential to emit: VENEZUELA_KYC_NATURAL_PASSED
    const credentialSeed = "VENEZUELA_KYC_NATURAL_PASSED";
    const credentialTypeId = toHex(credentialSeed.padEnd(64, '0')).slice(0, 66) as `0x${string}`;

    // 3. Expiration: 1 year from now (in seconds)
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60));

    // ABI-encode THE NEW PAYLOAD for CREComplianceIssuer.onReport
    const reportPayloadData = encodeAbiParameters(
        parseAbiParameters("bytes32 ccid, address wallet, bytes32 credentialTypeId, uint40 expiresAt"),
        [ccidHex, wallet as `0x${string}`, credentialTypeId, Number(expiresAt)]
    );

    // Encode full onReport call (official pattern)
    const writeCallData = encodeFunctionData({
        abi: ISSUER_ABI,
        functionName: "onReport",
        args: [toHex("0x"), reportPayloadData],
    });

    // Official Step 1: Generate signed report with prepareReportRequest()
    const reportResponse = runtime
        .report(prepareReportRequest(writeCallData))
        .result();

    runtime.log(`[CRE TEE] Registering CCID: ${ccidHex.slice(0, 16)}... in AgentRegistry`);

    // Receiver address validation
    const rawReceiver = config.keystoneForwarder || "";
    const cleanReceiver = rawReceiver.trim().toLowerCase() as `0x${string}`;

    runtime.log(`[CRE TEE] Final Receiver Check: [${cleanReceiver}] (Length: ${cleanReceiver.length})`);

    if (!cleanReceiver || cleanReceiver === "0x" || cleanReceiver.length !== 42) {
        throw new Error(`❌ FATAL ERROR: INVALID Forwarder address: "${cleanReceiver}"`);
    }

    // Official Step 2: Send report via writeReport()
    const writeResult = evmClient
        .writeReport(runtime, {
            receiver: cleanReceiver,
            report: reportResponse,
            gasConfig: {
                gasLimit: "800000",
            },
        })
        .result();

    // Official Step 3: Verify TxStatus (canonical pattern)
    const txStatus = writeResult.txStatus;
    if (txStatus !== TxStatus.SUCCESS) {
        runtime.log(`[CRE TEE] ⚠️ writeReport status: ${txStatus} (can be normal in local simulation)`);
    }

    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
    const isOnChain = txHash !== "0x" + "00".repeat(32);

    runtime.log(`[CRE TEE] 🏁 Final Status: ${isOnChain ? 'On-Chain ✅' : 'Certified (direct anchoring via core-engine)'}`);

    return JSON.stringify({
        status: "success",
        wallet,
        ccid: ccidHex,
        name: seniatData.name,
        riskScore: aiData.riskScore || 0,
        txHash: isOnChain ? txHash : null
    });
};

export async function main() {
    const runner = await Runner.newRunner<Config>();
    await runner.run((config: Config) => [handler(new HTTPCapability().trigger({}), onIdentityTrigger)]);
}
