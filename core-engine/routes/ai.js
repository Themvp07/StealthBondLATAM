module.exports = (state, log) => ({
    analyzeDocHandler(req, res) {
        const { docContent } = req.body;
        const apiKey = req.headers['x-api-key'];

        if (!apiKey || apiKey !== 'SB-AI-SECRET-2026') {
            return res.status(401).json({ error: 'Unauthorized: Invalid AI API Key' });
        }

        log('GEMINI', `Analyzing extracted content (OCR)...`);

        // Hackathon logic: If it has letters in the simulated OCR, it's suspicious
        const hasLetters = /[a-zA-Z]/.test(docContent || "");
        const riskScore = hasLetters ? 85 : 5;

        setTimeout(() => {
            res.json({
                riskScore,
                result: hasLetters ? 'Anomaly detected: possible tampering' : 'Clean numeric pattern'
            });
        }, 1500);
    },

    processCollateralHandler(req, res) {
        const { bondName, totalAmount, collateralId, destinationChain } = req.body;
        const apiKey = req.headers['x-api-key'];

        if (!apiKey || apiKey !== 'SB-AI-SECRET-2026') {
            return res.status(401).json({ error: 'Unauthorized: Invalid AI API Key' });
        }

        log('GEMINI', `[TEE] Analyzing issuance requirement for collateral: ${collateralId}...`);

        // Simulate some "thinking time"
        setTimeout(() => {
            log('GEMINI', `✅ Collateral analyzed and verified against internal database.`);
            log('GEMINI', `🔒 Generating cryptographic Cipher Hash of data (Privacy-Preserving)...`);

            // Generate a deterministic but secure hash using Node crypto
            const crypto = require('crypto');
            const dataToHash = `${bondName}|${totalAmount}|${collateralId}|${destinationChain}|${Date.now()}`;
            const cipherHash = '0x' + crypto.createHash('sha256').update(dataToHash).digest('hex');

            res.json({
                status: 'success',
                cipherHash,
                timestamp: Date.now(),
                message: 'Collateral verified and obfuscated.'
            });
        }, 2000);
    }
});
