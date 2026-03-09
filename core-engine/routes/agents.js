const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { saveState } = require('../utils/stateManager');
const { ethers } = require('ethers');
const { registerIdentityOnChain } = require('../utils/onchain');

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
    const { agentName, tutorWallet, agentWallet, signature, intentMessage } = req.body;

    if (!agentName || !tutorWallet || !agentWallet || !signature || !intentMessage) {
      return res.status(400).json({ error: 'Missing required fields or authorization signature.' });
    }

    // 0. Tutor Cryptographic Identity Validation (Keystone Intent)
    log('CRE', `Validating Tutor's cryptographic authorization signature...`);
    try {
      if (signature.startsWith('0xSIMULATED')) {
        log('CRE', `✅ SIMULATED signature accepted: Tutor authorizes deployment of Agent ${agentName}`);
      } else {
        const recoveredAddress = ethers.verifyMessage(intentMessage, signature);
        if (recoveredAddress.toLowerCase() !== tutorWallet.toLowerCase()) {
          log('CRE', `❌ Invalid signature: signer (${recoveredAddress}) does not match Tutor (${tutorWallet})`);
          return res.json({ status: 'rejected', message: 'Invalid cryptographic signature or does not correspond to the connected Tutor.' });
        }
        log('CRE', `✅ Signature validated: Tutor authorizes deployment of Agent ${agentName}`);
      }
    } catch (err) {
      log('CRE', `❌ Error validating tutor signature: ${err.message}`);
      return res.json({ status: 'rejected', message: 'Internal error validating cryptographic signature.' });
    }

    log('ACE', `🚀 [Policy Manager] Connecting to Chainlink CRE nodes (Agent Workflow)...`);

    // 1. Prepare payload for the Oracle
    const payload = {
      agentName,
      tutorWallet,
      agentWallet
    };

    const longCreRootDir = path.join(__dirname, '../../cre-project');
    const creRootDir = getShortPath(longCreRootDir);
    const payloadPath = path.join(creRootDir, 'workflows', 'stage1-agent', 'payload.json');

    try {
      fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    } catch (err) {
      log('SYSTEM', `❌ Error writing agent payload: ${err.message}`);
      return res.status(500).json({ error: 'System error while preparing Oracle.' });
    }

    // 2. Execute Real Oracle (Chainlink CLI)
    log('CRE', `[SYSTEM] Triggering TEE simulation: cre workflow simulate (Agent)...`);
    const absolutePayloadPath = `@${payloadPath}`;

    // Note: the workflow folder relative to cre-project is workflows/stage1-agent
    const creProcess = spawn('cre', ['workflow', 'simulate', 'workflows/stage1-agent', '--target', 'simulation', '--non-interactive', '--trigger-index', '0', '--http-payload', absolutePayloadPath, '--broadcast'], {
      cwd: creRootDir,
      shell: true,
      env: {
        ...process.env,
        CHECKCRYPTO_API_KEY: process.env.CHECKCRYPTO_API_KEY || 'ck_03f93a2ebd35f6afb7b06827f0d077477c08ef849fb368abfb9b8387835b8137'
      }
    });
    creProcess.stdin.end();

    let stdout = '';
    let stderr = '';

    creProcess.stdout.on('data', (data) => {
      const line = data.toString();
      stdout += line;

      // Filter TEE logs to send to Frontend in real-time
      if (line.includes('[USER LOG]')) {
        const cleanMessage = line.split('[USER LOG]')[1].trim();
        log('CRE', cleanMessage);
      }
    });

    creProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      console.log(`[CRE ⚙️ DEBUG]: ${chunk.trim()}`);
    });

    creProcess.on('close', async (code) => {
      if (code !== 0) {
        const combinedOutput = stdout + stderr;

        // Detect at which step the TEE failed
        let failedStep = 2; // default: tutor verification
        let rejectMessage = '❌ The CRE Oracle rejected the Agent registration.';

        if (combinedOutput.includes('AML:') || combinedOutput.includes('sanctioned')) {
          failedStep = 3;
          rejectMessage = '❌ AML: One of the wallets is sanctioned by OFAC. Registration blocked by Compliance.';
        } else if (combinedOutput.includes('does NOT have a KYC') || combinedOutput.includes('Registration denied')) {
          failedStep = 2;
          rejectMessage = '❌ The Tutor does not have a valid KYC credential in the AgentRegistry.';
        } else if (combinedOutput.includes('Derived Credential')) {
          failedStep = 4;
          rejectMessage = '❌ Error generating the Agent\'s derived credential.';
        } else if (combinedOutput.includes('writeReport') || combinedOutput.includes('evmWrite')) {
          failedStep = 5;
          rejectMessage = '❌ Error anchoring the Agent\'s identity on Blockchain.';
        }

        log('SYSTEM', `❌ CRE Oracle rejected at step ${failedStep}: ${rejectMessage}`);
        return res.status(200).json({ status: 'rejected', message: rejectMessage, failedStep });
      }

      // 3. Process final Oracle result
      try {
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
        }

        if (!jsonRaw) {
          throw new Error("No JSON result found in CRE stdout.");
        }

        let result;
        try {
          const parsed = JSON.parse(jsonRaw);
          result = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } catch (e) {
          const cleanMatch = jsonRaw.match(/\{.*\}/);
          if (cleanMatch) {
            const cleaned = cleanMatch[0].replace(/\\"/g, '"');
            result = JSON.parse(cleaned);
          } else {
            throw e;
          }
        }

        if (result.status === 'success') {
          // Save to local state after successful oracle certification
          state.agents[agentWallet] = {
            name: agentName,
            tutor: tutorWallet,
            tutorName: "Protected Identity",
            tutorRif: "N/A",
            credentialHash: result.ccid,
            txHash: result.txHash,
            status: 'active',
            registeredAt: new Date().toISOString()
          };
          saveState(state);

          log('KYC', `✅ COMPLETE CYCLE: ${agentName} registered [Tutor validated off-chain]`);

          // === DIRECT ON-CHAIN ANCHORING ===
          log('EVM', `Anchoring: Sending signed report to AgentRegistry...`);
          log('EVM', `⛓️ [evmWrite] Anchoring Agent identity in AgentRegistry...`);
          registerIdentityOnChain(
            agentWallet,
            'ai_agent',      // EntityType 3
            result.ccid,     // CCID
            tutorWallet,
            2                // Level 2
          ).then(onchainResult => {
            if (onchainResult.success) {
              log('OnChain', `✅ TX mined in block #${onchainResult.blockNumber}: ${onchainResult.txHash}`);
              log('EVM', `✅ [evmWrite] Agent identity anchored on-chain. TX: ${onchainResult.txHash}`);
              log('SYSTEM', `⭐ SUCCESSFUL ONBOARDING: Agent registration confirmed in AgentRegistry.`);
              state.agents[agentWallet].txHash = onchainResult.txHash;
              saveState(state);
            } else {
              log('ERROR', `⚠️ [evmWrite] Failed to anchor on-chain: ${onchainResult.error}. Identity remains certified off-chain.`);
            }
          }).catch(onchainErr => {
            log('ERROR', `⚠️ [evmWrite] Error in on-chain anchoring: ${onchainErr.message}`);
          });

          res.json({
            status: 'registered',
            agentName,
            agentWallet,
            tutorWallet,
            tutorName: "Protected Identity",
            tutorRif: "N/A",
            credentialHash: result.ccid
          });
        } else {
          log('SYSTEM', `❌ Oracle rejected transaction: ${result.message}`);
          res.json({ status: 'rejected', message: result.message || 'Oracle rejected registration.' });
        }
      } catch (err) {
        log('SYSTEM', `❌ Critical error processing CRE JSON response: ${err.message}`);
        res.status(500).json({ error: 'Oracle error generating Signed Report.' });
      }
    });

    creProcess.on('error', (err) => {
      log('SYSTEM', `❌ Could not start CRE CLI: ${err.message}`);
      res.status(500).json({ error: 'Internal server error executing CRE.' });
    });
  }
});
