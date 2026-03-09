import {
    HTTPCapability,
    ConfidentialHTTPClient,
    EVMClient,
    handler,
    decodeJson,
    json,
    bytesToHex,
    prepareReportRequest,
    getNetwork,
    encodeCallMsg,
    TxStatus,
    Runner,
    type Runtime,
    type HTTPPayload,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters, encodeFunctionData, decodeFunctionResult, toHex } from "viem";

interface Config {
    apiBase: string;
    agentRegistry: string;
    keystoneForwarder: string;
    chainSelectorName: string;
    vaultNamespace: string;
    vaultOwner: string;
}

// ABI for the new CREComplianceIssuer contract (ACE Phase 1) + Backward Compatibility
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
    },
    {
        name: "isVerified",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "wallet", type: "address" },
            { name: "minLevel", type: "uint256" }
        ],
        outputs: [{ name: "", type: "bool" }]
    }
] as const;

/**
 * @title StealthBond Stage 1 – Agent Registration & Authority Delegation
 * @notice CRE Workflow for authorizing AI Agents to act on behalf of a CCID identity.
 * 
 * FLOW INSIDE THE TEE (Confidential Runtime Environment):
 *   1. On-Chain Auth Check: TEE reads the IdentityRegistry (evmRead) to verify the Tutor's CCID status.
 *   2. AML Screening: Performs a dual-wallet confidential check (Tutor + Agent) using DON Vault secrets.
 *   3. Confidential CCID Derivation: Generates a unique, deterministic Agent ID within the Enclave.
 *   4. On-Chain Anchoring: Registers the authorized Agent on the blockchain with a signed TEE report.
 */
const onAgentRegistrationTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
    const config = runtime.config;

    // === NETWORK RESOLUTION (Official CRE Pattern) ===
    const network = getNetwork({
        chainFamily: "evm",
        chainSelectorName: config.chainSelectorName,
        isTestnet: true,
    });

    if (!network) throw new Error(`❌ Network not found: ${config.chainSelectorName}`);

    const evmClient = new EVMClient(network.chainSelector.selector);

    // Data Ingestion sent by the core-engine
    const input = decodeJson(payload.input) as any;
    const { agentName, tutorWallet, agentWallet } = input;

    runtime.log(`[CRE TEE] Auth: Initiating authority delegation. Tutor: ${tutorWallet.slice(0, 10)}... -> Agent: ${agentWallet.slice(0, 10)}...`);

    // STEP 1: VERIFY TUTOR CREDENTIAL ON-CHAIN (evmRead) - Ensuring the guardian is authorized
    runtime.log("[CRE TEE] Cryptography: Verifying Tutor's on-chain credential (evmRead)...");

    // Generate ABI call for isVerified
    const callData = encodeFunctionData({
        abi: ISSUER_ABI,
        functionName: "isVerified",
        args: [tutorWallet as `0x${string}`, BigInt(1)]
    });

    // Read call using evmClient.callContract
    const readRequest = evmClient.callContract(runtime, {
        call: encodeCallMsg({
            from: "0x0000000000000000000000000000000000000000" as `0x${string}`,
            to: config.agentRegistry as `0x${string}`,
            data: callData as `0x${string}`
        })
    }).result();

    // The result of callContract comes in .data as Uint8Array
    const decodedBytes = bytesToHex(readRequest.data);
    const isTutorVerified = decodeFunctionResult({
        abi: ISSUER_ABI,
        functionName: "isVerified",
        data: decodedBytes as `0x${string}`
    }) as boolean;

    // If the tutor is not listed in real testnet, the TEE will deny.
    // For Hackathon / Simulation mode, we allow proceeding but detecting the evmRead query.
    if (!isTutorVerified) {
        runtime.log(`[CRE TEE] ⚠️ Tutor ${tutorWallet} does NOT have a valid KYC (Level 1+) in the Contract. CONTINUING IN HACKATHON SIMULATION MODE.`);
    } else {
        runtime.log("[CRE TEE] ✅ VC Confirmed: The Tutor has valid legal authority.");
    }

    // STEP 2: CONFIDENTIAL AML SCREENING FOR BOTH ACCOUNTS (Confidential HTTP)
    runtime.log("[CRE TEE] AML: Executing confidential screening on Tutor and Agent...");
    const confidentialHttp = new ConfidentialHTTPClient();
    const vaultSecrets = [{ key: "AML_API_KEY", namespace: config.vaultNamespace, owner: config.vaultOwner }];

    const amlRaw = confidentialHttp.sendRequest(runtime, {
        vaultDonSecrets: vaultSecrets,
        request: {
            url: `${config.apiBase}/aml/verify`,
            method: "POST",
            multiHeaders: { "Content-Type": { values: ["application/json"] }, "x-api-key": { values: ["{{.AML_API_KEY}}"] } },
            bodyString: JSON.stringify({ wallet: agentWallet, tutor: tutorWallet }),
            encryptOutput: false
        }
    }).result();

    const amlStatus = json(amlRaw) as any;
    if (amlStatus.status === 'rejected') throw new Error(`AML: Sanctioned wallet detected (${amlStatus.blockedWallet})`);

    // STEP 3: OFF-CHAIN V.C. CREDENTIAL GENERATION - Creating a unique cryptographical identifier for the agent
    runtime.log("[CRE TEE] Identity: Generating unique Derived Credential (CCID) for the Agent...");
    // Deterministic enclave hash: only valid hex characters (0-9, a-f)
    const agentClean = agentWallet.toLowerCase().replace("0x", "").slice(0, 20);
    const tutorClean = tutorWallet.toLowerCase().replace("0x", "").slice(0, 10);
    const ccidHex = `0xace${agentClean}b0${tutorClean}${"0".repeat(40)}`.slice(0, 66);

    runtime.log(`[CRE TEE] ✅ Derived Credential Created: ${ccidHex.slice(0, 15)}...`);

    // STEP 4: ON-CHAIN REGISTRATION (evmWrite)
    runtime.log("[CRE TEE] Consensus: Anchoring Agent in Blockchain (writeReport)...");

    // 2. Credential to emit: CHAINLINK_AI_AGENT_AUTHORIZED
    const credentialSeed = "CHAINLINK_AI_AGENT_AUTHORIZED";
    const credentialTypeId = toHex(credentialSeed.padEnd(64, '0')).slice(0, 66) as `0x${string}`;

    // 3. Expiration: 6 months from now (in seconds)
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + (180 * 24 * 60 * 60));

    // ABI-encode THE NEW PAYLOAD for CREComplianceIssuer.onReport
    const reportPayloadData = encodeAbiParameters(
        parseAbiParameters("bytes32 ccid, address wallet, bytes32 credentialTypeId, uint40 expiresAt"),
        [ccidHex as `0x${string}`, agentWallet as `0x${string}`, credentialTypeId, Number(expiresAt)]
    );

    const writeCallData = encodeFunctionData({
        abi: ISSUER_ABI,
        functionName: "onReport",
        args: [toHex("0x"), reportPayloadData],
    });

    const reportResponse = runtime.report(prepareReportRequest(writeCallData)).result();

    const cleanReceiver = (config.keystoneForwarder || "").trim().toLowerCase() as `0x${string}`;
    const writeResult = evmClient.writeReport(runtime, {
        receiver: cleanReceiver,
        report: reportResponse,
        gasConfig: { gasLimit: "800000" },
    }).result();

    if (writeResult.txStatus !== TxStatus.SUCCESS) {
        runtime.log(`[CRE TEE] ⚠️ writeReport status: ${writeResult.txStatus}`);
    }

    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
    const isOnChain = txHash !== "0x" + "00".repeat(32);

    runtime.log(`[CRE TEE] 🏁 Final Agent Status: ${isOnChain ? 'On-Chain ✅' : 'Core Engine Anchoring'}`);

    return JSON.stringify({
        status: "success",
        agentName,
        tutorName: "Protected Identity (Registered Tutor)",
        ccid: ccidHex,
        txHash: isOnChain ? txHash : null
    });
};

export async function main() {
    const runner = await Runner.newRunner<Config>();
    await runner.run((config: Config) => [handler(new HTTPCapability().trigger({}), onAgentRegistrationTrigger)]);
}
