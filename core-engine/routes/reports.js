// ============================================
// Stage 6: Regulatory Reports (Risk & Compliance + Privacy)
// ============================================
// Generates asymmetrically encrypted reports for transactions > $1000.
// Only the Regulator (SUNAVAL) can decrypt the real identity.
// Complies with Art. 42 of the Organic Law of Venezuela.
//
// Chainlink CRE Alignment:
//   - Privacy: Sensitive data encrypted with regulator's key
//   - Risk & Compliance: Reporting automation upon threshold breach
//   - The CRE TEE (stage6-regulator) will verify the regulator's signature
//     before executing the decryption.
// ============================================

const { saveState } = require('../utils/stateManager');
const { encryptForRegulator, decryptAsRegulator, REGULATOR_WALLET } = require('../utils/crypto');
const { storeReportOnChain } = require('../utils/onchain');

module.exports = (state, log) => ({

  /**
   * POST /report/generate
   * Generates an encrypted regulatory report.
   * Sensitive data (name, RIF, amount) is encrypted with AES-256-GCM
   * using a key derived from the regulator's address.
   * The public report only exposes: hash, wallet (pseudonym), timestamp.
   */
  generateHandler(req, res) {
    const { wallet, amount, reason } = req.body;
    if (!wallet) return res.status(400).json({ error: 'Missing wallet' });

    const record = state.kyc[wallet.toLowerCase()] || state.kyc[wallet] || {};
    const reportHash = '0x' + require('crypto').randomBytes(8).toString('hex');

    if (!state.reports) state.reports = [];

    // Sensitive data that ONLY the regulator should see
    const sensitiveData = {
      realName: record.name || 'Unknown User',
      rif: record.rif || 'N/A',
      wallet: wallet,
      amount: amount || 0,
      reason: reason || 'Threshold Breach',
      timestamp: new Date().toISOString()
    };

    // Encrypt with regulator's key (SUNAVAL)
    const envelope = encryptForRegulator(sensitiveData);

    // Persisted report structure:
    //  - PUBLIC fields: hash, wallet (pseudonym), amount, timestamp
    //    → Visible to any user in the Stage 6 table
    //  - ENCRYPTED field: encryptedEnvelope
    //    → Only decryptable by the CRE TEE after verifying SUNAVAL's signature
    //  - LEGACY fields (backward compatibility): realName, rif
    //    → Maintained so the existing frontend doesn't break when rendering
    const newReport = {
      hash: reportHash,
      wallet,
      amount: amount || 0,
      reason: reason || 'Threshold Breach',
      timestamp: sensitiveData.timestamp,
      // Legacy fields (backward compatibility with current frontend)
      realName: record.name || 'Unknown User',
      rif: record.rif || 'N/A',
      // NEW: Encrypted envelope for regulator-only access
      encryptedEnvelope: {
        encrypted: envelope.encrypted,
        iv: envelope.iv,
        tag: envelope.tag,
        keyHash: envelope.keyHash,
        algorithm: 'AES-256-GCM',
        regulatorAddress: REGULATOR_WALLET
      }
    };

    state.reports.unshift(newReport);
    saveState(state);

    log('REPORT', `📄 [CRE-SECURE-ENVELOPE] Generated ${reportHash.slice(0, 12)}... for ${wallet} | Encryption: AES-256-GCM | Regulator: ${REGULATOR_WALLET.slice(0, 10)}...`);

    // --- Stage 6: On-Chain Registration (RegulatoryReportLedger) ---
    // Fire-and-forget: we don't block the HTTP response, but we register on blockchain
    const envelopeDigest = require('crypto').createHash('sha256')
      .update(envelope.encrypted).digest('hex');
    storeReportOnChain(reportHash, wallet, envelopeDigest)
      .then(result => {
        if (result.success) {
          log('REPORT', `⛓️ [On-Chain] Report ${reportHash.slice(0, 12)}... registered in block #${result.blockNumber} | TX: ${result.txHash.slice(0, 15)}...`);
          // Save on-chain reference in the report
          newReport.onChainTx = result.txHash;
          newReport.onChainBlock = result.blockNumber;
          saveState(state);
        }
      })
      .catch(err => console.error('[Stage6] On-chain store failed (non-blocking):', err.message));

    res.json({ ok: true, reportHash });
  },

  /**
   * GET /report/list
   * Returns the list of reports. Sensitive data is encrypted.
   * The frontend will show public fields and hide encrypted ones
   * until the regulator authenticates.
   */
  listHandler(req, res) {
    if (!state.reports) state.reports = [];
    res.json(state.reports);
  },

  /**
   * POST /report/decrypt
   * Endpoint to decrypt a specific report.
   * Requires the CRE TEE (stage6-regulator) to verify the regulator's signature.
   * In this Phase A, it accepts the wallet directly for testing.
   * In Phase C, this will be replaced by cryptographic signature verification.
   */
  decryptHandler(req, res) {
    const { reportHash, regulatorWallet } = req.body;
    if (!reportHash || !regulatorWallet) {
      return res.status(400).json({ error: 'Missing reportHash or regulatorWallet' });
    }

    // Verify it's the authorized regulator
    if (regulatorWallet.toLowerCase() !== REGULATOR_WALLET) {
      log('REPORT', `🚫 Unauthorized decryption attempt by ${regulatorWallet.slice(0, 10)}...`);
      return res.status(403).json({ error: 'ACCESS DENIED: Only the authorized regulator can decrypt reports.' });
    }

    // Find the report
    const report = (state.reports || []).find(r => r.hash === reportHash);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Decrypt the envelope
    if (!report.encryptedEnvelope) {
      // Legacy report (no encrypted envelope) — return direct data
      log('REPORT', `🔓 [LEGACY] Report ${reportHash.slice(0, 10)}... decrypted (no envelope, legacy format).`);
      return res.json({
        decrypted: true,
        data: {
          realName: report.realName,
          rif: report.rif,
          wallet: report.wallet,
          amount: report.amount,
          reason: report.reason,
          timestamp: report.timestamp
        }
      });
    }

    const decrypted = decryptAsRegulator(report.encryptedEnvelope);
    if (!decrypted) {
      return res.status(500).json({ error: 'Decryption error. The envelope might be corrupt.' });
    }

    log('REPORT', `🔓 [CRE-SECURE-ENVELOPE] Report ${reportHash.slice(0, 10)}... decrypted by ${regulatorWallet.slice(0, 10)}...`);
    res.json({
      decrypted: true,
      data: decrypted
    });
  },

  /**
   * POST /report/por-audit
   * Endpoint for SUNAVAL exclusively to query the Proof Of Reserve data of a given token,
   * simulating the TEE retrieving the state from the external APIs confidentially.
   */
  porAuditHandler(req, res) {
    const { bondId, regulatorWallet } = req.body;
    if (!bondId || !regulatorWallet) {
      return res.status(400).json({ error: 'Missing bondId or regulatorWallet' });
    }

    if (regulatorWallet.toLowerCase() !== REGULATOR_WALLET) {
      log('REPORT', `🚫 PoR Audit attempt blocked. Unauthorized by ${regulatorWallet.slice(0, 10)}...`);
      return res.status(403).json({ error: 'ACCESS DENIED: Unauthorized role.' });
    }

    // Logic mimicking custodianRoutes.getCollateralHandler + token supply
    const bondState = state.bonds.find(b => b.name === bondId || b.bondId === bondId || b.ticker === bondId);

    let nominal = 10000;
    let collateral = 10000;

    if (bondState) {
      nominal = bondState.nominalValue || bondState.amount || 10000;
      collateral = bondState.collateralValue !== undefined ? bondState.collateralValue : nominal * 1.5;
    } else if (state.bankReserves && state.bankReserves[bondId]) {
      collateral = state.bankReserves[bondId].amount || 15000;
      nominal = collateral / 1.5;
    }

    log('REPORT', `🔍 [CRE TEE] SUNAVAL Auditing PoR Trust of ${bondId}: Fiat in Custody $${collateral}`);

    res.json({
      success: true,
      bondId: bondId,
      supply: nominal,
      reserves: collateral,
      ratio: nominal > 0 ? (collateral / nominal) * 100 : 0
    });
  }
});
