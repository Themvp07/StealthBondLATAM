const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { saveState } = require('../utils/stateManager');
const { isAnvilRunning, registerIdentityOnChain } = require('../utils/onchain');

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
    async registerHandler(req, res) {
        const { lei, wallet: rawWallet, rif, companyName, ocrContent, docHash } = req.body;
        const wallet = rawWallet ? rawWallet.toLowerCase() : null;

        if (!wallet || !lei || !rif || !companyName) {
            return res.status(400).json({ error: 'Missing required fields: wallet, lei, rif, companyName.' });
        }

        // Validate LEI format (20 alphanumeric characters)
        if (!/^[A-Z0-9]{20}$/.test(lei)) {
            return res.status(400).json({ error: 'Invalid LEI code. Must be exactly 20 alphanumeric characters.' });
        }

        log('ACE', `🚀 [Identity Manager] Initiating GLEIF corporate verification for ${companyName}...`);

        // 1. Prepare payload for the CRE workflow
        const payload = {
            wallet,
            lei,
            companyName,
            rif,
            docHash: docHash || "ANY",
            ocrContent: ocrContent || "99887766"
        };

        const longCreRootDir = path.join(__dirname, '../../cre-project');
        const creRootDir = getShortPath(longCreRootDir);
        const payloadPath = path.join(creRootDir, 'payload.json');

        try {
            fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
        } catch (err) {
            log('SYSTEM', `❌ Error writing payload: ${err.message}`);
            return res.status(500).json({ error: 'System error while preparing Oracle.' });
        }

        // 2. Execute the corporate CRE workflow
        log('CRE', `Auth: Initiating secure connection with Chainlink CRE TEE nodes...`);
        log('CRE', `[SYSTEM] Triggering TEE simulation: cre workflow simulate (stage1-company)...`);

        const absolutePayloadPath = `@${payloadPath}`;

        const creProcess = spawn('cre', ['workflow', 'simulate', 'workflows/stage1-company', '--target', 'simulation', '--non-interactive', '--trigger-index', '0', '--http-payload', absolutePayloadPath, '--broadcast'], {
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
        creProcess.stdin.end();

        let stdout = '';
        let stderr = '';
        let triggerEmitted = false;

        creProcess.stdout.on('data', (data) => {
            const line = data.toString();
            stdout += line;

            if (!triggerEmitted) {
                triggerEmitted = true;
                log('CRE', `Trigger: Activating TEE identity cycle confirmed by CRE process.`);
            }

            if (line.includes('[USER LOG]')) {
                const cleanMessage = line.split('[USER LOG]')[1].trim();
                log('CRE', cleanMessage);
            }
        });

        creProcess.stderr.on('data', (data) => {
            const line = data.toString().trim();
            stderr += line + '\n';

            const isRealError = line.toLowerCase().includes('failed') ||
                line.toLowerCase().includes('error:') ||
                line.toLowerCase().includes('panic') ||
                line.toLowerCase().includes('fatal');

            if (isRealError) {
                log('ERROR', `[CRE ❌] ${line}`);
            } else if (line.trim()) {
                log('CRE', `[CRE ⚙️] ${line}`);
            }
        });

        creProcess.on('close', async (code) => {
            if (code !== 0) {
                const combinedOutput = stderr + stdout;
                let failedStep = 3;
                let rejectMessage = 'Oracle execution failed.';

                if (combinedOutput.includes('Error: AML:')) {
                    failedStep = 7;
                    rejectMessage = '🚨 AML: Corporate wallet blocked by international sanctions (OFAC).';
                    log('AML', `🚨 ALERT: Corporate wallet blocked for ${wallet}`);
                } else if (combinedOutput.includes('Error: SENIAT:')) {
                    failedStep = 5;
                    const seniatMsg = combinedOutput.match(/Error: SENIAT: (.+)/)?.[1] || 'Corporate RIF not found in SENIAT.';
                    rejectMessage = `❌ SENIAT: ${seniatMsg}`;
                    log('SENIAT', `❌ SENIAT validation failed for corporate RIF: ${rif}`);
                } else if (combinedOutput.includes('Error: GLEIF:')) {
                    failedStep = 5;
                    const gleifMsg = combinedOutput.match(/Error: GLEIF: (.+)/)?.[1] || 'Invalid or expired LEI.';
                    rejectMessage = `❌ GLEIF: ${gleifMsg}`;
                    log('GLEIF', `❌ GLEIF validation failed for LEI: ${lei}`);
                } else if (combinedOutput.includes('Unacceptable risk') || combinedOutput.includes('Catastrophic failure')) {
                    failedStep = 6;
                    rejectMessage = '⚠️ AI: Risk analysis rejected the corporate document.';
                }

                log('SYSTEM', `❌ Oracle rejected at step ${failedStep}: ${rejectMessage}`);
                return res.status(200).json({ status: 'rejected', message: rejectMessage, failedStep });
            }

            // 3. Process result
            try {
                console.log("[DEBUG-COMPANY] Searching for result in stdout...");

                let jsonRaw = "";
                const resultPrefix = 'Workflow Simulation Result:';
                if (stdout.includes(resultPrefix)) {
                    const afterPrefix = stdout.split(resultPrefix)[1].trim();
                    if (afterPrefix.startsWith('"')) {
                        const lastQuoteIdx = afterPrefix.lastIndexOf('"');
                        jsonRaw = afterPrefix.substring(0, lastQuoteIdx + 1);
                    } else {
                        jsonRaw = afterPrefix;
                    }
                } else {
                    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) throw new Error('Oracle JSON result not found');
                    jsonRaw = jsonMatch[0];
                }

                console.log("[DEBUG-COMPANY] FINAL extracted block:", jsonRaw);

                let result;
                try {
                    const parsed = JSON.parse(jsonRaw);
                    if (typeof parsed === 'string') {
                        result = JSON.parse(parsed);
                    } else {
                        result = parsed;
                    }
                } catch (e) {
                    console.error("[DEBUG-COMPANY] Error in parsing:", e.message);
                    const cleanMatch = jsonRaw.match(/\{.*\}/);
                    if (cleanMatch) {
                        const cleaned = cleanMatch[0].replace(/\\"/g, '"');
                        result = JSON.parse(cleaned);
                    } else {
                        throw e;
                    }
                }

                if (result.status === 'success') {
                    state.kyc[wallet] = {
                        status: 'verified',
                        type: 'company',
                        lei: result.lei,
                        wallet,
                        rif,
                        name: result.name,
                        gleifStatus: result.gleifStatus,
                        corroboration: result.corroboration,
                        credentialHash: result.ccid,
                        riskScore: result.riskScore,
                        verifiedAt: new Date().toISOString()
                    };
                    saveState(state);

                    log('ACE', `✅ Company Certified by Chainlink CRE. LEI: ${lei} | CCID: ${result.ccid}`);
                    log('ACE', `Identity: Generating corporate CCID and emitting on-chain credential for ${wallet.slice(0, 10)}...`);

                    // === ON-CHAIN ANCHORING ===
                    log('EVM', `Anchoring: Sending signed report to AgentRegistry via Keystone...`);
                    log('EVM', `⛓️ [evmWrite] Anchoring corporate identity in AgentRegistry...`);
                    try {
                        const onchainResult = await registerIdentityOnChain(
                            wallet,
                            'company',
                            result.ccid,
                            '0x0000000000000000000000000000000000000000',
                            2  // Level 2: Institutional
                        );

                        if (onchainResult.success) {
                            log('OnChain', `✅ TX mined in block #${onchainResult.blockNumber}: ${onchainResult.txHash}`);
                            log('EVM', `✅ [evmWrite] Corporate identity anchored on-chain. TX: ${onchainResult.txHash}`);
                            log('SYSTEM', `Cycle complete: Company ${result.name} successfully registered via GLEIF + CRE.`);
                            state.kyc[wallet].txHash = onchainResult.txHash;
                            saveState(state);
                        } else {
                            log('ERROR', `⚠️ [evmWrite] On-chain anchoring failed: ${onchainResult.error}.`);
                        }
                    } catch (onchainErr) {
                        log('ERROR', `⚠️ [evmWrite] Error in on-chain anchoring: ${onchainErr.message}`);
                    }

                    return res.json({
                        status: 'verified',
                        ...state.kyc[wallet]
                    });
                } else {
                    log('SYSTEM', `❌ Error processing Oracle response: ${result.message || 'Unknown error'}`);
                    return res.status(200).json({ status: 'rejected', message: result.message || 'Oracle processing failed.', failedStep: result.failedStep || 0 });
                }
            } catch (err) {
                log('SYSTEM', `❌ Error processing Oracle response: ${err.message}`);
                return res.status(500).json({ error: `System error while processing Oracle response: ${err.message}` });
            }
        });
    }
});
