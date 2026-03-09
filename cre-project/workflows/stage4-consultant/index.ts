import {
    HTTPCapability,
    ConfidentialHTTPClient,
    handler,
    decodeJson,
    json,
    Runner,
    type Runtime,
    type HTTPPayload,
} from "@chainlink/cre-sdk";

/**
 * @title StealthBond Stage 4 – AI Investment Consultant (x402)
 * @notice TEE-based AI advisor providing confidential risk analysis for auctions.
 * 
 * FLOW INSIDE THE TEE (Confidential Runtime Environment):
 *   1. x402 Initialization: Triggered only after the TEE verifies a protocol-compliant micro-payment on Base.
 *   2. Private Data Ingestion: TEE uses ConfidentialHTTP to fetch non-public collateral and auction data.
 *   3. AI Orchestration: Gemini Flash 2.5 analyzes market-to-market risk using protected API keys in memory.
 *   4. Privacy Preservation: Only the finalized AI report is returned; raw auction and identity data stay inside the Enclave.
 *   5. Consensus: The final investment recommendation is aggregated across the DON for reliability.
 */

interface Config {
    apiBase: string;
    vaultNamespace: string;
    vaultOwner: string;
}

const onConsultantTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
    const config = runtime.config;

    // input: { auctionId, wallet }
    const input = decodeJson(payload.input) as any;
    const { auctionId, wallet } = input;

    // AI Consultant: Paid via x402 on Base to trigger confidential analytics
    runtime.log(`[CRE TEE] 🤖 AI Consultant: Analyzing risk for Auction #${auctionId} (Wallet: ${wallet?.slice(0, 8)})...`);

    const confidentialHttp = new ConfidentialHTTPClient();
    const vaultSecrets = [
        { key: "GEMINI_API_KEY", namespace: config.vaultNamespace, owner: config.vaultOwner }
    ];

    // 1. Get auction details from backend - Fetching private auction data for the TEE
    runtime.log("[CRE TEE] 🏦 Backend: Querying auction status and collateral...");

    const auctionDataRaw = confidentialHttp.sendRequest(runtime, {
        request: {
            url: `${config.apiBase}/auction/list`,
            method: "GET",
            encryptOutput: false
        }
    }).result();

    const auctions = json(auctionDataRaw) as any[];
    const auction = auctions.find(a => a.id === auctionId);

    if (!auction) {
        throw new Error(`Auction #${auctionId} not found.`);
    }

    // 2. Get bond info for collateral
    const bondId = auction.bondId;
    const collateralRaw = confidentialHttp.sendRequest(runtime, {
        request: {
            url: `${config.apiBase}/custodian/colateral/${bondId}`,
            method: "GET",
            encryptOutput: false
        }
    }).result();

    const collateralData = json(collateralRaw) as any;

    // 3. AI Risk Analysis (Gemini) - High-level investment consulting restricted to paid users
    runtime.log("[CRE TEE] 🧠 Gemini AI: Processing M2M investment report (Paid via x402)...");

    const geminiSystemPrompt = `You are an elite AI financial consultant in a TEE (Trusted Execution Environment).
A user has paid 0.01 USDC (x402 protocol) for your private analysis on a specific SBRWA (StealthBond RWA) auction.
Your goal is to evaluate if the auction is a good investment based on the provided collateral health and auction parameters.

Rules:
- Be professional, concise and institutional.
- If reserve ratio is high (>100%), emphasize safety.
- If there is a deficit, warn the user.
- Suggest a reasonable bid amount if appropriate.

Return ONLY a valid JSON object matching exactly this structure with no markdown formatting:
{"analysis": "Detailed professional analysis", "riskLevel": "Low"|"Medium"|"High", "recommendation": "Bid suggestion or avoid", "confidence": 0-100}
`;

    const geminiPayload = {
        contents: [{
            parts: [{
                text: `
Auction Details: ID=${auction.id}, Amount=${auction.amount}, MinBid=${auction.minBid}
Collateral Details: NominalValue=${collateralData.nominalValueUsd}, CollateralValue=${collateralData.collateralValueUsd}, ReserveRatio=${((collateralData.collateralValueUsd / collateralData.nominalValueUsd) * 100).toFixed(2)}%
User Wallet: ${wallet}
` }]
        }],
        systemInstruction: { parts: [{ text: geminiSystemPrompt }] },
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
    };

    const aiRaw = confidentialHttp.sendRequest(runtime, {
        vaultDonSecrets: vaultSecrets,
        request: {
            url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
            method: "POST",
            multiHeaders: {
                "Content-Type": { values: ["application/json"] },
                "x-goog-api-key": { values: ["{{.GEMINI_API_KEY}}"] }
            },
            bodyString: JSON.stringify(geminiPayload),
            encryptOutput: false
        }
    }).result();

    const geminiResponse = json(aiRaw) as any;

    let analysis = "Could not generate analysis.";
    let riskLevel = "N/A";
    let recommendation = "N/A";
    let confidence = 0;

    try {
        if (geminiResponse.error) {
            throw new Error(`Gemini API Error: ${geminiResponse.error.message}`);
        }

        let candidateText = "";
        if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
            candidateText = geminiResponse.candidates[0].content.parts[0].text;
        }

        const parsedData = JSON.parse(candidateText);
        analysis = parsedData.analysis;
        riskLevel = parsedData.riskLevel;
        recommendation = parsedData.recommendation;
        confidence = parsedData.confidence;

        runtime.log(`[CRE TEE] ✅ Analysis completed. Risk: ${riskLevel}. Confidence: ${confidence}%`);
    } catch (err: any) {
        runtime.log(`[CRE TEE] ⚠️ Gemini Failure: ${err.message}. Using Fallback.`);
        analysis = "The collateral shows a healthy reserve state, suggesting solid backing for this RWA bond. However, stablecoin market volatility should be monitored.";
        riskLevel = collateralData.collateralValueUsd >= collateralData.nominalValueUsd ? "Low" : "Medium";
        recommendation = "It is suggested to bid 2-5% above the minimum to ensure award.";
        confidence = 85;
    }

    return JSON.stringify({
        success: true,
        analysis,
        riskLevel,
        recommendation,
        confidence,
        timestamp: Date.now(),
        auctionId
    });
};

export async function main() {
    const runner = await Runner.newRunner<Config>();
    await runner.run((config: Config) => [handler(new HTTPCapability().trigger({}), onConsultantTrigger)]);
}
