const { ethers } = require('ethers');
const axios = require('axios');

// Minimum required ABI from AggregatorV3Interface (extracted from project documentation)
const AGGREGATOR_ABI = [
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "latestRoundData",
        "outputs": [
            { "internalType": "uint80", "name": "roundId", "type": "uint80" },
            { "internalType": "int256", "name": "answer", "type": "int256" },
            { "internalType": "uint256", "name": "startedAt", "type": "uint256" },
            { "internalType": "uint256", "name": "updatedAt", "type": "uint256" },
            { "internalType": "uint80", "name": "answeredInRound", "type": "uint80" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// Chainlink Feeds Configuration (Ethereum Mainnet)
// Note: CRE allows simulating real Mainnet calls even if we are on local Anvil.
const CHAINLINK_FEEDS = {
    "USDC-USD": {
        address: "0x37be050e75C7F0a80F0E8abBFC2c4Ff826728cAa".toLowerCase(), // SVR Proxy: USDC/USD-RefPrice-DF-Ethereum-001
        standardAddress: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6".toLowerCase(), // Standard Feed
        isSVR: true,
        chain: "ethereum-mainnet"
    },
    "EURC-USD": {
        address: "0x04F84020Fdf10d9ee64D1dcC2986EDF2F556DA11".toLowerCase(), // Standard: EURC/USD-RefPrice-DF-Ethereum-001
        isSVR: false,
        chain: "ethereum-mainnet"
    }
};

// Public RPC for CRE Simulator (Ethereum Mainnet)
// In a real CRE implementation, the SDK manages this via chain-selectors.
// Here we use a public RPC to simulate the behavior of the CRE EVMClient.
const MAINNET_RPC = "https://ethereum-rpc.publicnode.com";

module.exports = (state, broadcast) => {

    // Internal cache to avoid saturating public RPCs
    const cache = {};
    const CACHE_TTL = 30000; // 30 seconds

    /**
     * Queries a Chainlink Data Feed simulating the CRE compliance flow.
     */
    const fetchChainlinkPrice = async (pair) => {
        const feed = CHAINLINK_FEEDS[pair];
        if (!feed) return null;

        // Check cache
        if (cache[pair] && (Date.now() - cache[pair].timestamp < CACHE_TTL)) {
            return cache[pair].data;
        }

        try {
            const provider = new ethers.JsonRpcProvider(MAINNET_RPC);
            const contract = new ethers.Contract(feed.address, AGGREGATOR_ABI, provider);

            const roundData = await contract.latestRoundData();
            const decimals = await contract.decimals();

            const result = {
                price: Number(roundData.answer) / (10 ** Number(decimals)),
                answer: roundData.answer.toString(),
                decimals: Number(decimals),
                updatedAt: Number(roundData.updatedAt) * 1000,
                roundId: roundData.roundId.toString(),
                isSVR: feed.isSVR
            };

            cache[pair] = { data: result, timestamp: Date.now() };
            return result;
        } catch (error) {
            broadcast('ERROR', `[Chainlink] Error querying feed ${pair}: ${error.message}`);
            return null;
        }
    };

    /**
     * Queries VES/USD price via Custom CRE Feed (DolarAPI).
     */
    const fetchVesPrice = async () => {
        try {
            broadcast('CRE', `[HTTP Capability] Executing HTTPS off-chain bridge to https://ve.dolarapi.com/v1/cotizaciones...`);
            const response = await axios.get('https://ve.dolarapi.com/v1/cotizaciones');
            const dataArray = response.data;
            const usdData = dataArray.find(item => item.moneda === 'USD');

            if (usdData && usdData.promedio) {
                const priceInBs = usdData.promedio;
                const vesPriceInUsd = 1 / priceInBs;

                broadcast('SYSTEM', `📈 [CRE Custom Feed] BCV Dollar = ${priceInBs} Bs/$. Implicit conversion injected on-chain.`);

                return {
                    price: vesPriceInUsd,
                    answer: Math.floor(vesPriceInUsd * (10 ** 8)),
                    decimals: 8,
                    rawFiatPrice: priceInBs,
                    source: "DolarAPI via CRE",
                    updatedAt: Date.now()
                };
            }
        } catch (e) {
            broadcast('ERROR', `[CRE] DolarAPI Timeout/Error: ${e.message}`);
            return null;
        }
    };

    return {
        getPriceHandler: async (req, res) => {
            const { pair } = req.params;
            const upperPair = pair.toUpperCase();

            // 1. Special case: VES-USD (CRE Custom Feed via HTTP)
            if (upperPair === "VES-USD") {
                const data = await fetchVesPrice();
                if (data) {
                    return res.json({
                        ...data,
                        roundId: Math.floor(Math.random() * 1000000),
                        startedAt: data.updatedAt
                    });
                }
                // Fallback if DolarAPI fails
                return res.json({ roundId: 1, answer: 238095, decimals: 8, rawFiatPrice: 420.00, fallback: true });
            }

            // 2. On-Chain Data Feeds (USDC SVR / EURC Standard)
            if (CHAINLINK_FEEDS[upperPair]) {
                const data = await fetchChainlinkPrice(upperPair);
                if (data) {
                    const isSvrLog = data.isSVR ? " 🛡️ SVR-Enabled (Anti-MEV)" : "";
                    broadcast('CRE', `[Data Feeds] Querying AggregatorV3Interface (Mainnet Shadow) for ${upperPair}...`);
                    broadcast('SYSTEM', `📈 [Data Feed] ${upperPair} = $${data.price.toFixed(6)}${isSvrLog}`);

                    return res.json({
                        roundId: data.roundId,
                        answer: data.answer,
                        startedAt: data.updatedAt,
                        updatedAt: data.updatedAt,
                        decimals: data.decimals,
                        isSVR: data.isSVR,
                        source: "Chainlink Mainnet via CRE SIM"
                    });
                } else {
                    // Fallback to Mock if RPC fails but pair is valid
                    const fallbackPrices = {
                        "USDC-USD": { price: 0.9998, decimals: 8, isSVR: true },
                        "EURC-USD": { price: 1.0850, decimals: 8, isSVR: false }
                    };
                    const fallback = fallbackPrices[upperPair];
                    broadcast('SYSTEM', `⚠️ [Data Feed] ${upperPair} (Mock Fallback due to RPC error)`);
                    return res.json({
                        roundId: 0,
                        answer: Math.floor(fallback.price * (10 ** fallback.decimals)),
                        decimals: fallback.decimals,
                        isSVR: fallback.isSVR,
                        source: "Mock Fallback (RPC Error)"
                    });
                }
            }

            // 3. Other Mocks (GOLD, STLB, etc)
            const mocks = {
                "GOLD-USD": { price: 2100, decimals: 8 },
                "STLB-USD": { price: 1, decimals: 8 }
            };

            const mock = mocks[upperPair];
            if (!mock) return res.status(404).json({ error: 'Price feed not found' });

            broadcast('CRE', `[Data Feeds] Using Local Mock for ${upperPair}...`);
            res.json({
                roundId: Date.now(),
                answer: Math.floor(mock.price * (10 ** mock.decimals)),
                decimals: mock.decimals,
                updatedAt: Date.now()
            });
        }
    };
};
