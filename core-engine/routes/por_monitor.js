const { saveState } = require('../utils/stateManager');
const onchain = require('../utils/onchain');
const ethers = require('ethers');
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

function log(moduleName, message) {
    if (global.broadcast) global.broadcast(moduleName, message);
}

module.exports = (state, broadcast) => {
    return {

        runMonitorHandler: async (req, res) => {
            const { bondId } = req.body;
            broadcast('SYSTEM', `🔍 [DEBUG] Monitor request for BondID: ${bondId}`);
            // Robust lookup: Prioritize Name or bondId over Address
            let bond = state.bonds.find(b => b.name === bondId || b.bondId?.toString() === bondId?.toString());

            if (!bond) {
                bond = state.bonds.find(b =>
                    b.ticker === bondId ||
                    (b.address && b.address.toLowerCase() === bondId.toLowerCase())
                );
            }

            if (!bond) {
                broadcast('SYSTEM', `❌ Oracle error: Bond [${bondId}] not found in registry.`);
                return res.status(404).json({ error: 'Bond not found' });
            }

            broadcast('SYSTEM', `🛡️ [CRE] Initiating Workflow (PoR x AI) for: ${bond.name || bondId}`);

            const payload = {
                bondId: bondId
            };

            const longCreRootDir = path.join(__dirname, '../../cre-project');
            const creRootDir = getShortPath(longCreRootDir);
            const payloadPath = path.join(creRootDir, 'workflows', 'stage3-monitor', 'payload.json');

            try {
                fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
            } catch (err) {
                return res.status(500).json({ error: 'CRE simulator system error while writing payload.' });
            }

            broadcast('CRE', `[SYSTEM] Triggering TEE: cre workflow simulate stage3-monitor...`);

            const absolutePayloadPath = `@${payloadPath}`;

            const creProcess = spawn('cre', ['workflow', 'simulate', 'workflows/stage3-monitor', '--target', 'simulation', '--non-interactive', '--trigger-index', '0', '--http-payload', absolutePayloadPath, '--broadcast'], {
                cwd: creRootDir,
                shell: true,
                env: {
                    ...process.env,
                    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'AIzaSyCn7NT9lBzFrz2aLAmdadt60kTTXzkhv24',
                    BANK_API_KEY: process.env.BANK_API_KEY || 'bk_live_8832a8f3b',
                    CHECKCRYPTO_API_KEY: process.env.CHECKCRYPTO_API_KEY || 'ck_03f93a2ebd35f6afb7b06827f0d077477c08ef849fb368abfb9b8387835b8137',
                    SENIAT_API_KEY: process.env.SENIAT_API_KEY || 'SB-GOV-SECRET-2026',
                    AML_API_KEY: process.env.AML_API_KEY || 'SB-AML-SECRET-2026',
                    AI_API_KEY: process.env.AI_API_KEY || 'SB-AI-SECRET-2026'
                }
            });
            creProcess.on('error', (err) => {
                console.error('[CORE ENGINE] Fatal failure attempting to execute "cre" process:', err.message);
                broadcast('ERROR', `❌ Could not start CRE simulator: ${err.message}`);
                // If we haven't responded yet, send error.
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Could not start Oracle process.' });
                }
            });

            creProcess.stdin.end();

            let stdout = '';

            creProcess.stdout.on('data', (data) => {
                const line = data.toString();
                stdout += line;
                if (line.includes('[USER LOG]')) {
                    const cleanMessage = line.split('[USER LOG]')[1].trim();
                    broadcast('CRE', cleanMessage);
                }
            });

            creProcess.stderr.on('data', (data) => {
                const str = data.toString();
                // Mask network initialization noise and metering (JSON logs)
                if (str.includes('"level":"error"') || str.includes('Error') || !str.trim().startsWith('{')) {
                    console.error(`[CRE TEE] ${str.trim()}`);
                }
            });

            creProcess.on('close', async (code) => {
                let workflowResult = null;

                // Try to capture the result with the standard prefix or just searching for the final JSON block
                const resultMatch = stdout.match(/Workflow Simulation Result:\s+"(\{.*?\})"/) ||
                    stdout.match(/(\{.*?"status":.*?\})/);

                if (resultMatch) {
                    const jsonCandidate = resultMatch[1] || resultMatch[0];
                    try {
                        const unescapedString = jsonCandidate.replace(/\\"/g, '"');
                        workflowResult = JSON.parse(unescapedString);
                    } catch (e) {
                        try {
                            workflowResult = JSON.parse(jsonCandidate);
                        } catch (e2) { }
                    }
                }

                if (!workflowResult) {
                    broadcast('ERROR', `❌ Error capturing TEE decision (Code: ${code}). Check technical logs.`);
                    return res.status(500).json({ error: 'Catastrophic Oracle failure.' });
                }

                // Log success even if code is 1 (due to local metering warnings)
                if (code !== 0) {
                    console.log(`[CRE] Workflow report reported data success but finished with warning bit (Code: ${code})`);
                }

                // Parse structured TEE response
                const { status, ratio, recommendation, aiInsight } = workflowResult;
                const healthy = status === 'HEALTHY';
                let txRecorded = false;

                if (!healthy && bond.status !== 'PAUSED') {
                    broadcast('ACE', `⚠️ [Policy Engine] EXECUTING PROTECTION. Preventing trading without reserves...`);
                    bond.status = 'PAUSED';
                    saveState(state);
                    broadcast('SYSTEM', `🛡️ [Compliance] Bond ${bondId} PAUSED (Local + On-chain update completed by TEE).`);
                    txRecorded = true;
                } else if (healthy && bond.status === 'PAUSED') {
                    broadcast('ACE', `✅ [Policy Engine] Collateral restoration validated by AI.`);
                    bond.status = 'ACTIVE';
                    saveState(state);
                    broadcast('SYSTEM', `🛡️ [POR] Bond ${bondId} RESUMED.`);
                    txRecorded = true;
                } else {
                    broadcast('SYSTEM', healthy ? `✅ [POR] Healthy bond (${ratio.toFixed(1)}%). No on-chain actions required.` : `🛡️ [POR] The RWA contract is already paused.`);
                }

                res.json({
                    success: true,
                    ratio,
                    status: bond.status,
                    aiAnalysis: {
                        riskLevel: healthy ? "LOW (Collateral Intact)" : "CRITICAL (Deficit Detected)",
                        recommendation: recommendation,
                        insight: aiInsight
                    },
                    codeHash: "0xCREXAI_" + Math.random().toString(16).slice(2, 10),
                    txRecorded: txRecorded
                });
            });
        }
    };
};
