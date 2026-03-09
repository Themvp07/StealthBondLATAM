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
  async startHandler(req, res) {
    const { type, lei, wallet: rawWallet, rif, ocrContent, docHash, checkOnly } = req.body;
    const wallet = rawWallet ? rawWallet.toLowerCase() : null;

    if (checkOnly && wallet) {
      const existing = state.kyc[wallet];
      return res.json({
        status: existing ? 'verified' : 'unregistered',
        entityType: existing ? (existing.type === 'company' ? 'COMPANY' : 'PERSON') : null
      });
    }

    if (!type || !wallet || !rif) {
      return res.status(400).json({ error: 'Missing required fields to start Oracle.' });
    }

    log('ACE', `🚀 [Identity Manager] Connecting to Chainlink CRE nodes...`);

    // 1. Prepare payload for the Oracle
    const payload = {
      wallet,
      rif,
      entityType: type === 'company' ? 2 : 1, // 1: Person, 2: Company
      docHash: docHash || "ANY",
      ocrContent: ocrContent || "99887766"
    };

    // Use Windows Short Path (8.3) to avoid issues with spaces ("CRE Hackthon")
    const longCreRootDir = path.join(__dirname, '../../cre-project');
    const creRootDir = getShortPath(longCreRootDir);
    const payloadPath = path.join(creRootDir, 'payload.json');

    try {
      fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    } catch (err) {
      log('SYSTEM', `❌ Error writing payload: ${err.message}`);
      return res.status(500).json({ error: 'System error while preparing Oracle.' });
    }

    // 2. Execute Real Oracle (Chainlink CLI)
    // Step 3: emitted NOW — backend starts TEE connection
    log('CRE', `Auth: Initiating secure connection with Chainlink CRE TEE nodes...`);
    log('CRE', `[SYSTEM] Triggering TEE simulation: cre workflow simulate...`);

    const absolutePayloadPath = `@${payloadPath}`;

    const creProcess = spawn('cre', ['workflow', 'simulate', 'workflows/stage1-identity', '--target', 'simulation', '--non-interactive', '--trigger-index', '0', '--http-payload', absolutePayloadPath, '--broadcast'], {
      cwd: creRootDir,
      shell: true,
      env: process.env
    });
    creProcess.stdin.end();

    let stdout = '';
    let stderr = '';
    let triggerEmitted = false; // ensure step 4 is emitted only once

    creProcess.stdout.on('data', (data) => {
      const line = data.toString();
      stdout += line;

      // Step 4: emitted when CRE process produces its FIRST real output
      // This confirms CRE is running and processing the workflow.
      if (!triggerEmitted) {
        triggerEmitted = true;
        log('CRE', `Trigger: Activating TEE identity cycle confirmed by CRE process.`);
      }

      // Filter TEE logs to send them to Front-end in real time
      if (line.includes('[USER LOG]')) {
        const cleanMessage = line.split('[USER LOG]')[1].trim();
        log('CRE', cleanMessage);
      }
    });

    creProcess.stderr.on('data', (data) => {
      const line = data.toString().trim();
      stderr += line + '\n';

      // CRE CLI writes normal progress to stderr (not real errors).
      // Only show as error if it contains failure keywords.
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
        // Parse stderr+stdout to identify WHICH step failed
        const combinedOutput = stderr + stdout;
        let failedStep = 3; // default: generic step
        let rejectMessage = 'Oracle execution failed.';

        if (combinedOutput.includes('Error: AML:')) {
          failedStep = 7;
          rejectMessage = '🚨 AML: Wallet blocked by international sanctions (OFAC). Access denied.';
          log('AML', `🚨 ALERT: Wallet blocked by AML/OFAC for ${wallet}`);
        } else if (combinedOutput.includes('Error: SENIAT:')) {
          failedStep = 5;
          const seniatMsg = combinedOutput.match(/Error: SENIAT: (.+)/)?.[1] || 'RIF not found in national records.';
          rejectMessage = `❌ SENIAT: ${seniatMsg}`;
          log('SENIAT', `❌ SENIAT validation failed for RIF: ${rif}`);
        } else if (combinedOutput.includes('Unacceptable risk') || combinedOutput.includes('Catastrophic Failure')) {
          failedStep = 6;
          rejectMessage = '⚠️ AI: Risk analysis rejected the document.';
        }

        log('SYSTEM', `❌ Oracle rejected at step ${failedStep}: ${rejectMessage}`);
        return res.status(200).json({ status: 'rejected', message: rejectMessage, failedStep });
      }

      // 3. Process final Oracle result
      try {
        console.log("[DEBUG] Searching for result in stdout...");

        let jsonRaw = "";
        const resultPrefix = 'Workflow Simulation Result:';
        if (stdout.includes(resultPrefix)) {
          // Extract everything after prefix
          const afterPrefix = stdout.split(resultPrefix)[1].trim();

          // If it starts with quote, look for balanced closing quote (or last quote before log/line break)
          if (afterPrefix.startsWith('"')) {
            // Search for last quote closing the JSON string (before simulation logs)
            const lastQuoteIdx = afterPrefix.lastIndexOf('"');
            jsonRaw = afterPrefix.substring(0, lastQuoteIdx + 1);
          } else {
            jsonRaw = afterPrefix;
          }
        } else {
          // Fallback to regex if prefix not found
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('Oracle JSON result not found');
          jsonRaw = jsonMatch[0];
        }

        console.log("[DEBUG] FINAL extracted block:", jsonRaw);

        let result;
        try {
          // Attempt 1: Parse directly
          const parsed = JSON.parse(jsonRaw);
          if (typeof parsed === 'string') {
            // If result is string, it was double encoded (escaped)
            // Parse again to get the object
            result = JSON.parse(parsed);
          } else {
            result = parsed;
          }
        } catch (e) {
          console.error("[DEBUG] Error in Parse Attempt 1:", e.message);
          // If direct parse fails, maybe regex grabbed interior of an escaped string
          // or some garbage remained. Attempt aggressive internal regex.
          const cleanMatch = jsonRaw.match(/\{.*\}/);
          if (cleanMatch) {
            const cleaned = cleanMatch[0].replace(/\\"/g, '"');
            result = JSON.parse(cleaned);
          } else {
            throw e;
          }
        }

        if (result.status === 'success') {
          // Save in local state after successful oracle certification
          state.kyc[wallet] = {
            status: 'verified',
            type,
            lei: lei || '',
            wallet,
            rif,
            name: result.name,
            credentialHash: result.ccid,
            riskScore: result.riskScore,
            verifiedAt: new Date().toISOString()
          };
          saveState(state);

          log('ACE', `✅ Identity Certified by Chainlink CRE. CCID: ${result.ccid}`);
          log('ACE', `Identity: Generating CCID and emitting on-chain credential for ${wallet.slice(0, 10)}...`);

          // === DIRECT ON-CHAIN ANCHORING ===
          log('EVM', `Anchoring: Sending signed report to AgentRegistry via Keystone...`);
          log('EVM', `⛓️ [evmWrite] Anchoring identity in AgentRegistry...`);
          try {
            const onchainResult = await registerIdentityOnChain(
              wallet,
              type,           // 'person' or 'company'
              result.ccid,    // Oracle generated CCID
              '0x0000000000000000000000000000000000000000',
              1               // Verification Level
            );

            if (onchainResult.success) {
              log('OnChain', `✅ TX mined in block #${onchainResult.blockNumber}: ${onchainResult.txHash}`);
              log('EVM', `✅ [evmWrite] Identity anchored on-chain. TX: ${onchainResult.txHash}`);
              log('SYSTEM', `Cycle complete: ACE Identity successfully registered for ${wallet.slice(0, 10)}...`);
              state.kyc[wallet].txHash = onchainResult.txHash;
              saveState(state);
            } else {
              log('ERROR', `⚠️ [evmWrite] On-chain anchoring failed: ${onchainResult.error}. Identity remains certified off-chain.`);
            }
          } catch (onchainErr) {
            log('ERROR', `⚠️ [evmWrite] Error in on-chain anchoring: ${onchainErr.message}`);
          }

          return res.json({
            status: 'verified',
            ...state.kyc[wallet]
          });
        } else {
          log('SYSTEM', `❌ Oracle rejected identity.`);
          return res.json({ status: 'rejected', message: 'Identity rejected by Oracle.' });
        }
      } catch (err) {
        log('SYSTEM', `❌ Error processing Oracle response: ${err.message}`);
        return res.status(500).json({ error: 'Communication error with Oracle.' });
      }
    });
  },

  async statusHandler(req, res) {
    const { wallet } = req.params;
    const addr = wallet.toLowerCase();

    // Look in state (KYC)
    const key = Object.keys(state.kyc).find(k => k.toLowerCase() === addr);
    const data = state.kyc[key];

    if (!data) {
      return res.json({ status: 'unregistered' });
    }

    res.json(data);
  }
});
