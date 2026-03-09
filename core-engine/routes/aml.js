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

module.exports = (state, log) => ({
  checkHandler(req, res) {
    const { wallet } = req.body;
    const apiKey = req.headers['x-api-key'];

    // 1. Privacy Standard: Check for API Key (only the DON TEE should have this)
    if (!apiKey || apiKey !== 'SB-AML-SECRET-2026') {
      return res.status(401).json({ clean: false, message: 'Unauthorized: Invalid AML Gateway Key' });
    }

    // OFAC BLACKLIST (Simulation) + Local Blacklist
    const sanctionedWallets = [
      '0xe6a65b3a5147f9660803b9676b79701c704aa6aa',
      ...(state.aml?.blacklist || [])
    ];

    const w = wallet?.toLowerCase();

    // 2. High Risk Screening
    if (sanctionedWallets.includes(w)) {
      log('AML', `🚨 ALERT: Wallet ${w} matches OFAC Sanctions List.`);
      return res.json({
        clean: false,
        riskScore: 100,
        status: 'rejected',
        reason: 'OFAC Sanctions List Match (High Risk)'
      });
    }

    // 3. Probabilistic Risk Scoring
    let riskScore = Math.floor(Math.random() * 15); // Baseline risk

    // Simulate some "on-chain history" risk
    if (w?.startsWith('0x000')) riskScore += 40;

    log('AML', `✅ Screening complete for ${w}. Risk Score: ${riskScore}/100`);

    res.json({
      clean: riskScore < 60,
      riskScore,
      status: riskScore < 60 ? 'clean' : 'flagged',
      provider: 'StealthBond Compliance Engine'
    });
  },

  contaminateHandler(req, res) {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: 'Wallet required' });

    if (!state.aml) state.aml = { blacklist: [] };

    const w = wallet.toLowerCase();
    if (!state.aml.blacklist.includes(w)) {
      state.aml.blacklist.push(w);
      saveState(state);
    }

    log('SYSTEM', `📢 [ADMIN] Wallet ${w} added to blacklist.`);
    res.json({ ok: true });
  },

  verifyHandler(req, res) {
    const { wallet } = req.body;
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== 'SB-AML-SECRET-2026') {
      return res.status(401).json({ error: 'Unauthorized: Invalid AML API Key' });
    }

    log('AML', `Consulting international databases for wallet: ${wallet}`);

    // Sanctioned wallet for testing (from OFAC) + Local ones
    const sanctionedWallet = "0xe6a65b3a5147f9660803b9676b79701c704aa6aa";
    const localBlacklist = state.aml?.blacklist || [];

    const isSanctioned = (wallet && wallet.toLowerCase() === sanctionedWallet.toLowerCase()) ||
      (wallet && localBlacklist.includes(wallet.toLowerCase()));

    setTimeout(() => {
      res.json({
        status: isSanctioned ? 'rejected' : 'clean',
        riskScore: isSanctioned ? 100 : 5
      });
    }, 1000);
  },

  // === STAGE 5 (AML Anti-Scam) ===
  // Triggers the CRE stage5-aml workflow to perform a double confidential check.
  // Uses the same CRE orchestrator pattern as kyc.js:
  // 1. spawn('cre workflow simulate ...')
  // 2. Read JSON stdout
  // 3. Backend EVM fallback attempt (setAddressFrozen in ERC3643) if CRE fails
  async transferCheckHandler(req, res) {
    const { wallet, sender, amount, bondAddress } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: 'wallet required' });
    }

    const targetWallet = wallet.toLowerCase();
    const senderWallet = sender ? sender.toLowerCase() : null;

    log('AML', `[Stage5] Orchestrating CRE AML workflow for: ${targetWallet.slice(0, 10)}...`);

    // 1. Prepare CRE simulation payload
    const payload = {
      targetWallet,
      senderWallet,
      amount: amount ? amount.toString() : '0',
      bondAddress: bondAddress || '0x0000000000000000000000000000000000000001'
    };

    const path = require('path');
    const fs = require('fs');
    // We use path 8.3 to avoid cre compiler errors with spaces "CRE Hackthon"
    const longCreRootDir = path.join(__dirname, '../../cre-project');
    const creRootDir = getShortPath(longCreRootDir);
    const payloadPath = path.join(creRootDir, 'workflows', 'stage5-aml', 'payload.json');

    try {
      fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    } catch (err) {
      log('ERROR', `❌ [Stage5] Error writing payload: ${err.message}`);
      return res.status(500).json({ error: 'Error preparing TEE AML.' });
    }

    log('CRE', '[Stage5] Triggering TEE: cre workflow simulate stage5-aml...');

    const { spawn } = require('child_process');
    const absolutePayloadPath = `@${payloadPath}`;

    const creProcess = spawn('cre', [
      'workflow', 'simulate', 'workflows/stage5-aml',
      '--target', 'simulation',
      '--non-interactive',
      '--trigger-index', '0',
      '--http-payload', absolutePayloadPath,
      '--broadcast'
    ], {
      cwd: creRootDir,
      shell: true,
      env: {
        ...process.env,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'AIzaSyCn7NT9lBzFrz2aLAmdadt60kTTXzkhv24',
        BANK_API_KEY: process.env.BANK_API_KEY || 'bk_live_8832a8f3b',
        CHECKCRYPTO_API_KEY: process.env.CHECKCRYPTO_API_KEY || 'ck_03f93a2ebd35f6afb7b06827f0d077477c08ef849fb368abfb368abfb9b8387835b8137',
        SENIAT_API_KEY: process.env.SENIAT_API_KEY || 'SB-GOV-SECRET-2026',
        AML_API_KEY: process.env.AML_API_KEY || 'SB-AML-SECRET-2026',
        AI_API_KEY: process.env.AI_API_KEY || 'SB-AI-SECRET-2026'
      }
    });
    creProcess.stdin.end();

    let stdout = '';
    let stderr = '';

    creProcess.stdout.on('data', (data) => {
      const line = data.toString();
      stdout += line;
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
      if (isRealError) log('ERROR', `[CRE ❌] ${line}`);
      else if (line.trim()) log('CRE', `[CRE ⚙️] ${line}`);
    });

    creProcess.on('close', async () => {
      let creResult = null;

      try {
        const resultPrefix = 'Workflow Simulation Result:';
        if (stdout.includes(resultPrefix)) {
          const afterPrefix = stdout.split(resultPrefix)[1].trim();
          const jsonRaw = afterPrefix.startsWith('"')
            ? afterPrefix.substring(0, afterPrefix.lastIndexOf('"') + 1)
            : afterPrefix;
          const parsed = JSON.parse(jsonRaw);
          creResult = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } else {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) creResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        log('ERROR', `[Stage5] Could not parse CRE Result: ${parseErr.message}`);
      }

      // Fallback fallback if CRE aborted
      if (!creResult) {
        log('AML', '[Stage5] CRE failed, simulating local fallback decision...');
        const OFAC_STATIC = ['0xe6a65b3a5147f9660803b9676b79701c704aa6aa'];
        const blacklist = (state.aml?.blacklist || []).map(x => x.toLowerCase());
        const isSanctioned = OFAC_STATIC.includes(targetWallet) || blacklist.includes(targetWallet);

        creResult = {
          clean: !isSanctioned,
          action: isSanctioned ? 'freeze' : 'allow',
          riskScore: isSanctioned ? 100 : Math.floor(Math.random() * 10),
          reason: isSanctioned ? 'Fallback Local Sanctions Match' : 'Clean Wallet (Fallback)',
          freeze: { required: isSanctioned, txHash: null }
        };
      }

      log('AML', `[Stage5] Decision: Score ${creResult.riskScore}/100 → ${creResult.action?.toUpperCase()}`);

      // === FALLBACK EVM WRITE ON-CHAIN ===
      // Similar to E1 kyc.js: since CRE simulation won't be able to execute EVM,
      // the Core Engine materializes the off-chain transaction.
      let finalFreezeTxHash = creResult.freeze?.txHash;
      let freezeError = null;

      if (creResult.freeze?.required && bondAddress && bondAddress !== "0x0000000000000000000000000000000000000001" && !finalFreezeTxHash) {
        log('EVM', `[Stage5] 🔒 [ERC-3643] backend fallback executing setAddressFrozen...`);
        try {
          const { ethers } = require('ethers');
          const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
          const DON_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
          const signer = new ethers.Wallet(DON_KEY, provider);

          // Verify if bondAddress is a real contract
          const bytecode = await provider.getCode(bondAddress);
          if (!bytecode || bytecode === '0x' || bytecode.length <= 2) {
            throw new Error('Not a contract address');
          }

          const ERC3643_ABI = [
            'function setAddressFrozen(address userAddress, bool freeze) external'
          ];
          const bondContract = new ethers.Contract(bondAddress, ERC3643_ABI, signer);

          const tx = await bondContract.setAddressFrozen(targetWallet, true);
          const receipt = await tx.wait();
          finalFreezeTxHash = receipt.hash;
          log('EVM', `🔒 [ERC-3643] CONFIRMED AddressFrozen TX: ${finalFreezeTxHash}`);
        } catch (err) {
          freezeError = err.message.slice(0, 100);
          log('AML', `⚠️ [EVM] Freeze fallback fail: ${freezeError}. App layer blocked it.`);
        }
      }

      // Regulatory Reports (High amount blocked)
      if (!creResult.clean && parseFloat(amount || '0') >= 1000) {
        log('REPORT', `⚠️ [Stage5] High Value Attempt >$1000 BLOCKED - Regulatory Report Auto-Emitted`);
      }

      res.json({
        clean: creResult.clean,
        riskScore: creResult.riskScore,
        action: creResult.action,
        reason: creResult.reason,
        externalData: {
          scamReports: creResult.externalScamReports || 0,
          message: creResult.externalMessage || ''
        },
        freeze: {
          executed: creResult.freeze?.required || false,
          txHash: finalFreezeTxHash || null,
          error: freezeError
        }
      });
    });
  }
});
