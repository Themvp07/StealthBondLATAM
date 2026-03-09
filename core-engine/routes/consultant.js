const { saveState } = require('../utils/stateManager');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

module.exports = (state, broadcast) => {
    return {
        /**
         * @notice Final AI analysis handler (Gated by x402 in server.js).
         * @dev This endpoint only executes if the x402 middleware in server.js
         *      validates that the 0.01 USDC payment on Base Sepolia was successful.
         */
        analyzeHandler: async (req, res) => {
            const { auctionId, wallet } = req.body;

            if (!auctionId || !wallet) {
                return res.status(400).json({ error: 'Missing auctionId or wallet parameters' });
            }

            broadcast('SYSTEM', `🛡️ [x402] Payment verified. Initiating Real Workflow in Chainlink CRE TEE...`);

            try {
                const payload = { auctionId, wallet };
                // We use the short path (8.3) to prevent spaces in "CRE Hackathon" from breaking arguments in the Windows shell
                const longCreRootDir = path.join(__dirname, '../../cre-project');
                const creRootDir = getShortPath(longCreRootDir);
                const payloadPath = path.join(creRootDir, 'payload_consultant.json');
                fs.writeFileSync(payloadPath, JSON.stringify(payload));

                // Execute real Stage 4 workflow
                broadcast('ACE', `🤖 [TEE] Executing workflow: stage4-consultant (Real TEE Mode)...`);

                const absolutePayloadPath = `@${payloadPath}`;
                const child = spawn('cre', [
                    'workflow', 'simulate',
                    'workflows/stage4-consultant',
                    '--target', 'simulation',
                    '--non-interactive',
                    '--trigger-index', '0',
                    '--http-payload', absolutePayloadPath,
                    '--env', '.env'
                ], {
                    cwd: creRootDir,
                    shell: true,
                    env: process.env
                });

                let output = '';
                let errorOutput = '';

                child.stdout.on('data', (data) => {
                    const str = data.toString();
                    output += str;
                    // Parse TEE logs to display them on the frontend
                    const lines = str.split('\n');
                    lines.forEach(line => {
                        if (line.includes('[CRE TEE]') || line.includes('[GEMINI]')) {
                            const cleanLine = line.replace(/.*\[/, '[');
                            broadcast('CRE', cleanLine.trim());
                        }
                    });
                });

                child.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                child.on('close', (code) => {
                    if (code !== 0) {
                        broadcast('ERROR', `TEE Workflow Error: ${errorOutput}`);
                        return res.status(500).json({ error: 'Enclave execution error.', details: errorOutput });
                    }

                    try {
                        console.log("[DEBUG] Consultant: Searching for result in stdout...");
                        let jsonRaw = "";
                        const resultPrefix = 'Workflow Simulation Result:';

                        if (output.includes(resultPrefix)) {
                            const afterPrefix = output.split(resultPrefix)[1].trim();
                            if (afterPrefix.startsWith('"')) {
                                // Search for the last quote that closes the JSON string
                                const lastQuoteIdx = afterPrefix.lastIndexOf('"');
                                jsonRaw = afterPrefix.substring(0, lastQuoteIdx + 1);
                            } else {
                                jsonRaw = afterPrefix.split('\n')[0].trim();
                            }
                        } else {
                            // Fallback to regex searching for JSON block
                            const jsonMatch = output.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                jsonRaw = jsonMatch[0];
                            } else {
                                throw new Error('Oracle JSON result not found');
                            }
                        }

                        // Double parsing: Chainlink returns the JSON as an escaped string (surrounded by quotes)
                        let result = JSON.parse(jsonRaw);
                        if (typeof result === 'string') {
                            result = JSON.parse(result);
                        }

                        broadcast('SYSTEM', `✅ [x402] Gamma Agent delivered the signed report successfully.`);
                        res.json(result);
                    } catch (e) {
                        console.error('[Consultant] JSON Parse Error:', e, 'Raw string extraction:', jsonRaw);
                        broadcast('ERROR', `Error parsing oracle result.`);
                        res.status(500).json({ error: 'Corrupt or invalid oracle result.' });
                    }
                });

            } catch (err) {
                console.error('[Consultant] Error:', err);
                broadcast('ERROR', `Failed to execute Agent analysis: ${err.message}`);
                res.status(500).json({ error: 'Internal failure in Agent oracle.' });
            }
        }
    };
};
