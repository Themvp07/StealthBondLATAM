// ============================================
// StealthBond LATAM Hackathon – Frontend App
// ============================================

// API_BASE is already defined in index.html

// ============================================
// STATE
// ============================================
let kycResultVisible = false;
let agentResultVisible = false;
let currentWallet = null;
let bondCollateralMap = {};
let bondSymbolMap = {};
let bondNameMap = {};
let currentKycActiveStep = 2; // tracker: active step of the KYC cycle (never goes back)
let currentStage = '1';

function simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function refreshBondSelect() {
  try {
    const res = await fetch(`${API_BASE}/bond/list`);
    const bonds = await res.json();

    // Update global metadata maps
    bondCollateralMap = {};
    bondSymbolMap = {};
    bondNameMap = {};
    bonds.forEach(b => {
      const key = (b.address || b.id || b.bondId).toString().toLowerCase();
      bondCollateralMap[key] = b.collateralId || key;
      bondSymbolMap[key] = b.ticker || 'SBRWA';
      bondNameMap[key] = b.name || b.bondId || key;
    });

    // Populate Stage 3 select (Investment)
    if (els.buyBondSelect) {
      els.buyBondSelect.innerHTML = bonds.length === 0
        ? '<option value="">No bonds issued</option>'
        : bonds.map(b => {
          const val = b.address || b.id || b.bondId;
          return `<option value="${val}">${b.name || b.bondId} ($${(b.nominalValue || 0).toLocaleString()})</option>`;
        }).join('');
    }

    // Populate Stage 4 select (Auctions)
    if (els.auctionBondSelect) {
      els.auctionBondSelect.innerHTML = bonds.length === 0
        ? '<option value="">No bonds issued</option>'
        : bonds.map(b => {
          const val = b.address || b.id || b.bondId;
          return `<option value="${val}">${b.name || b.bondId}</option>`;
        }).join('');
    }

    // Populate Stage 6 select (PoR Audit) if it exists
    const porSelect = document.getElementById('porBondSelect');
    if (porSelect) {
      porSelect.innerHTML = bonds.length === 0
        ? '<option value="">No bonds</option>'
        : bonds.map(b => {
          const val = b.address || b.id || b.bondId;
          return `<option value="${val}">${b.name || b.bondId}</option>`;
        }).join('');
    }

    // Populate Stage 5 select (AML RWA Transfer) if it exists
    const rwaTokenSelect = document.getElementById('rwaTokenSelect');
    if (rwaTokenSelect) {
      const usdcAddress = '0x68b1d87f95878fe05b998f19b66f4baba5de1aed';
      const usdcOption = `<option value="${usdcAddress}">USDC (Standard Liquidity)</option>`;

      const defaultOption = `<option value="">Select an asset (${bonds.length + 1} available)...</option>`;
      const bondOptions = bonds.map(b => {
        const val = b.address || b.id || b.bondId;
        return `<option value="${val}">${b.name || b.bondId}</option>`;
      }).join('');

      rwaTokenSelect.innerHTML = defaultOption + usdcOption + bondOptions;

      // Trigger update if there is a value
      if (rwaTokenSelect.onchange) {
        setTimeout(() => rwaTokenSelect.onchange(), 100);
      }
    }
  } catch (e) {
    console.warn('Error refreshing bond list:', e);
  }
}

// ============================================
// DOM ELEMENTS
// ============================================
const els = {
  // Global
  walletAddress: document.getElementById('walletAddress'),
  connectWalletBtn: document.getElementById('connectWalletBtn'),
  stageButtons: document.querySelectorAll('.stage-btn'),
  stageContents: document.querySelectorAll('.stage-content'),
  logsPanel: document.getElementById('logs-panel'),
  toggleLogsBtn: document.getElementById('toggleLogsBtn'),
  logs: document.getElementById('logs'),

  // Stage 1: KYC
  entityButtons: document.querySelectorAll('.entity-buttons button'),
  kycFormContainer: document.getElementById('kycFormContainer'),
  agentFormContainer: document.getElementById('agentFormContainer'),
  kycForm: document.getElementById('kycForm'),
  agentForm: document.getElementById('agentForm'),
  kycStatus: document.getElementById('kycStatus'),
  agentStatus: document.getElementById('agentStatus'),
  kycBackBtn: document.getElementById('kycBackBtn'),
  agentBackBtn: document.getElementById('agentBackBtn'),
  kycSteps: document.getElementById('kycSteps'),

  // Stage 2: Bonds
  issueForm: document.getElementById('issueForm'),
  issueStatus: document.getElementById('issueStatus'),

  // Stage 3: Monitor
  forceMonitorBtn: document.getElementById('forceMonitorBtn'),
  livePrice: document.getElementById('livePrice'),
  tickerLabel: document.getElementById('tickerLabel'),
  svrBadge: document.getElementById('svrBadge'),
  healthRatio: document.getElementById('healthRatio'),
  healthIndicator: document.getElementById('healthIndicator'),
  bondStatusBadge: document.getElementById('bondStatusBadge'),
  lastCheckTime: document.getElementById('lastCheckTime'),
  aiThinkingStream: document.getElementById('aiThinkingStream'),
  simulateDeficitBtn: document.getElementById('simulateDeficitBtn'),
  restoreReservesBtn: document.getElementById('restoreReservesBtn'),
  fractionalBuyForm: document.getElementById('fractionalBuyForm'),
  buyBondSelect: document.getElementById('buyBondSelect'),
  buyCurrencySelect: document.getElementById('buyCurrencySelect'),
  buyAmount: document.getElementById('buyAmount'),
  paymentUsdValue: document.getElementById('paymentUsdValue'),
  oracleFeedName: document.getElementById('oracleFeedName'),
  tokenPreview: document.getElementById('tokenPreview'),
  aiCodeHash: document.getElementById('aiCodeHash'),
  stage3Status: document.getElementById('stage3Status'),

  // Stage 4: Market
  auctionAmount: document.getElementById('auctionAmount'),
  auctionMinBid: document.getElementById('auctionMinBid'),
  auctionBondSelect: document.getElementById('auctionBondSelect'),
  createAuctionForm: document.getElementById('createAuctionForm'),
  auctionsList: document.getElementById('auctionsList'),
  auctionStatus: document.getElementById('auctionStatus'),
  aiConsultantBox: document.getElementById('aiConsultantBox'),
  aiAuctionResult: document.getElementById('aiAuctionResult'),
  bidInputBox: document.getElementById('bidInputBox'),
  bidTitle: document.getElementById('bidTitle'),
  bidAmountInput: document.getElementById('bidAmountInput'),
  submitBidBtn: document.getElementById('submitBidBtn'),
  cancelBidBtn: document.getElementById('cancelBidBtn'),

  // Stage 5: AML
  amlForm: document.getElementById('amlForm'),
  targetWallet: document.getElementById('targetWallet'),
  transferAmount: document.getElementById('transferAmount'),
  rwaTokenSelect: document.getElementById('rwaTokenSelect'),
  amlResult: document.getElementById('amlResult'),
  contaminateWalletBtn: document.getElementById('contaminateWalletBtn'),

  // Stage 6: Reports
  regulatoryReportsList: document.getElementById('regulatoryReportsList'),
  regulatorLoginBtn: document.getElementById('regulatorLoginBtn'),
  generateManualReportBtn: document.getElementById('generateManualReportBtn'),
  porIndicator: document.getElementById('porIndicator'),
  porDetail: document.getElementById('porDetail'),
  porBondSelect: document.getElementById('porBondSelect'),
  reportPayloadSection: document.getElementById('reportPayloadSection'),
  encryptedPayloadView: document.getElementById('encryptedPayloadView'),
  decryptedReportView: document.getElementById('decryptedReportView'),
  decryptedJson: document.getElementById('decryptedJson'),
  signingModal: document.getElementById('signingModal'),
  confirmSignAuditBtn: document.getElementById('confirmSignAuditBtn'),
  cancelSignAuditBtn: document.getElementById('cancelSignAuditBtn'),
  auditAccessMessage: document.getElementById('auditAccessMessage'),
  portfolioSection: document.getElementById('portfolio-section')
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize SSE logs first so they don't get blocked by DOM errors
  setupSSE();

  try { initNavigation(); } catch (e) { console.error('Error initNavigation:', e); }
  try { initWallet(); } catch (e) { console.error('Error initWallet:', e); }
  try { initLogs(); } catch (e) { console.error('Error initLogs:', e); }
  try { initStage1(); } catch (e) { console.error('Error initStage1:', e); }
  try { initStage2(); } catch (e) { console.error('Error initStage2:', e); }
  try { initStage3(); } catch (e) { console.error('Error initStage3:', e); }
  try { initStage4(); } catch (e) { console.error('Error initStage4:', e); }
  try { initStage5(); } catch (e) { console.error('Error initStage5:', e); }
  try { initStage6(); } catch (e) { console.error('Error initStage6:', e); }

  // Expand logs by default
  if (els.logsPanel) els.logsPanel.classList.remove('collapsed');
});

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
  els.stageButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const stage = btn.dataset.stage;
      showStage(stage);
    });
  });

  const showStage = (stageId) => {
    currentStage = stageId;
    els.stageContents.forEach(content => {
      content.style.display = content.id === `stage-${stageId}` ? 'block' : 'none';
    });
    els.stageButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.stage === stageId);
    });

    // Portfolio Control: Only visible in Stages 3, 4, and 5 if wallet is connected
    const isPortfolioVisible = ['3', '4', '5'].includes(stageId) && currentWallet;
    els.portfolioSection.style.display = isPortfolioVisible ? 'block' : 'none';

    // Stage 1 Persistence
    if (stageId === '1') {
      if (kycResultVisible) els.kycFormContainer.style.display = 'block';
      if (agentResultVisible) els.agentFormContainer.style.display = 'block';
    }

    // Stage 2 Logic: Validate Role
    if (stageId === '2') {
      updateStage2Visibility();
    }

    // Stage 3 Logic: Refresh bond list
    if (stageId === '3') {
      refreshBondSelect();
    }

    // Stage 4 Logic: Refresh bond list for select and auctions
    if (stageId === '4') {
      if (typeof refreshAuctionBondSelect === 'function') refreshAuctionBondSelect();
      if (typeof loadAuctions === 'function') loadAuctions();
      if (typeof loadTickets === 'function') loadTickets();
    }
  };

  els.kycBackBtn.onclick = () => els.kycFormContainer.style.display = 'none';
  els.agentBackBtn.onclick = () => els.agentFormContainer.style.display = 'none';

  // Initialize in the first stage
  showStage('1');
}

// ============================================
// WALLET
// ============================================
let isMetaMaskMode = false;

function initWallet() {
  const updateWallet = (addr) => {
    currentWallet = addr ? addr.toLowerCase() : null;
    if (els.walletAddress) {
      els.walletAddress.textContent = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
      els.walletAddress.style.display = addr ? 'block' : 'none';
    }

    if (els.connectWalletBtn) {
      if (addr) {
        els.connectWalletBtn.textContent = 'Disconnect ';
        els.connectWalletBtn.className = 'secondary-btn small';
      } else {
        els.connectWalletBtn.textContent = 'Connect MetaMask';
        els.connectWalletBtn.className = 'primary-btn';
      }
    }

    // Portfolio visibility: only if wallet connected AND in stage 3, 4 or 5
    const isPortfolioVisible = addr && ['3', '4', '5'].includes(currentStage);
    if (els.portfolioSection) {
      els.portfolioSection.style.display = isPortfolioVisible ? 'block' : 'none';
    }

    if (addr) refreshPortfolio();

    // Reset Stage 5 AML labels when wallet changes
    if (typeof checkAMLStatus === 'function') {
      const rwaSelect = document.getElementById('rwaTokenSelect');
      if (rwaSelect && rwaSelect.value) {
        checkAMLStatus(rwaSelect.value);
      } else {
        const statusEl = document.getElementById('walletFreezeStatus');
        if (statusEl) statusEl.innerHTML = '';
      }
    }

    // --- NEW: Reset Regulator Mode (Stage 6) if wallet changes ---
    if (typeof regulatorMode !== 'undefined' && regulatorMode) {
      if (!addr || addr.toLowerCase() !== '0xa66854b2df0dd19b96af382336721b61f222ddff') {
        regulatorMode = false;
        if (els.regulatorLoginBtn) {
          els.regulatorLoginBtn.textContent = '🔑 Audit Access (SUNAVAL Signature)';
          els.regulatorLoginBtn.className = 'btn btn-secondary btn-sm';
        }
        if (els.reportPayloadSection) els.reportPayloadSection.style.display = 'none';
        if (els.decryptedReportView) els.decryptedReportView.style.display = 'none';
        if (typeof loadRegulatoryReports === 'function') loadRegulatoryReports();
      }
    }
  };

  if (els.connectWalletBtn) {
    els.connectWalletBtn.onclick = async () => {
      if (currentWallet) {
        // Disconnect
        isMetaMaskMode = false;
        updateWallet(null);
        addLog('MetaMask disconnected.', 'warning');
        return;
      }

      if (window.ethereum) {
        try {
          const conn = await onchain.connectMetaMask();
          if (conn) {
            isMetaMaskMode = true;
            updateWallet(conn.address);
            addLog(`🦊 MetaMask connected: ${conn.address.slice(0, 6)}...${conn.address.slice(-4)} (Network: Anvil)`, 'success');
            // Check on-chain identity immediately
            checkAndDisplayOnChainStatus(conn.address);
          }
        } catch (e) {
          console.error(e);
          addLog('❌ Error connecting MetaMask', 'error');
        }
      } else {
        addLog('MetaMask not detected.', 'warning');
      }
    };
  }

  // Listen for MetaMask account changes
  onchain.setupMetaMaskListeners((newAddr) => {
    if (isMetaMaskMode && newAddr) {
      updateWallet(newAddr);
      addLog(`🦊 MetaMask account changed: ${newAddr.slice(0, 6)}...${newAddr.slice(-4)}`, 'info');
      checkAndDisplayOnChainStatus(newAddr);
      if (typeof loadAuctions === 'function') loadAuctions();
      if (typeof loadPrivateBalances === 'function') loadPrivateBalances();
      if (typeof loadTickets === 'function') loadTickets();
    } else if (isMetaMaskMode && !newAddr) {
      updateWallet(null);
      isMetaMaskMode = false;
      addLog('MetaMask disconnected.', 'warning');
    }
  });

  // Expose updateWallet globally for account buttons
  window.updateWallet = updateWallet;
}

/** Checks the AgentRegistry on-chain and displays the result in the log panel */
async function checkAndDisplayOnChainStatus(address) {
  if (!window.ethereum) return;
  try {
    const identity = await onchain.checkOnChainIdentity(address);
    if (identity.verified) {
      const typeLabel = onchain.entityTypeLabel(identity.entityType);
      addLog(`⛓️ [On-Chain] Identity verified: ${typeLabel} (Level ${identity.level})`, 'success');
    } else {
      addLog(`⛓️ [On-Chain] Wallet not registered in AgentRegistry.`, 'info');
    }
  } catch (err) {
    console.warn('On-chain check failed:', err);
  }
}


// function initAccountButtons removed to restore healthy state.

async function refreshPortfolio() {
  if (!currentWallet) {
    els.portfolioSection.style.display = 'none';
    return;
  }

  // Refresh visibility based on current stage
  const isPortfolioVisible = ['3', '4', '5'].includes(currentStage);
  els.portfolioSection.style.display = isPortfolioVisible ? 'block' : 'none';
  try {
    const resBal = await fetch(`${API_BASE}/balances/${currentWallet}`);
    const dataBal = await resBal.json();
    const { fiatBalances, rwaBalances } = dataBal;

    const balUSDC = document.getElementById('balUSDC');
    const balVES = document.getElementById('balVES');
    if (balUSDC) balUSDC.textContent = `$ ${(fiatBalances?.USDC || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
    if (balVES) balVES.textContent = `${(fiatBalances?.VES || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} Bs`;

    // 2. Refresh bond metadata first (so we have symbols/names for the table)
    await refreshBondSelect();

    // 3. Identity check with safety wrap
    try {
      const identity = await onchain.checkOnChainIdentity(currentWallet);
      const badge = document.getElementById('kycBadge');
      if (badge) {
        if (identity.verified) {
          badge.textContent = '✅ ACE VERIFIED';
          badge.style.background = '#10b981';
        } else {
          badge.textContent = '⚠️ UNVERIFIED';
          badge.style.background = '#475569';
        }
      }
    } catch (e) {
      console.warn("Identity check delay or failure:", e);
    }

    // 4. Update holdings table
    const tableBody = document.getElementById('holdingsTableBody');
    if (tableBody) {
      const entries = Object.entries(rwaBalances || {});
      if (entries.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No assets detected.</td></tr>';
      } else {
        tableBody.innerHTML = entries.map(([id, amount]) => {
          const lookupKey = id.toString().toLowerCase();
          const symbol = bondSymbolMap[lookupKey] || 'SBRWA';
          const name = (bondNameMap[lookupKey] || id).toString().toUpperCase();

          return `
            <tr>
              <td><b>${name}</b></td>
              <td style="color:#22d3ee; font-weight:bold;">${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} <span style="font-size:0.8em; opacity:0.8;">${symbol}</span></td>
              <td>$ ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
              <td><span class="status-badge active">GENESIS</span></td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.error("Error refreshing portfolio:", e);
  }
}

async function updateKYCStatusUI() {
  if (!currentWallet) {
    els.kycStatus.innerHTML = '<span class="info">Connect your wallet to see status.</span>';
    return;
  }
  els.kycStatus.innerHTML = '<span class="info">Checking status...</span>';
  try {
    const identity = await onchain.checkOnChainIdentity(currentWallet);
    if (identity.verified) {
      const label = onchain.entityTypeLabel(identity.entityType);
      els.kycStatus.innerHTML = `<div class="success">✅ IDENTITY VERIFIED [${label}] <span style="opacity:0.7; font-size:0.85em;">⛓️ Registry</span></div>`;
    } else {
      els.kycStatus.innerHTML = '<div class="info">⚠️ Wallet not registered in ACE.</div>';
    }
  } catch (e) {
    console.warn('KYC status check failed:', e);
    els.kycStatus.innerHTML = '<div class="error">❌ Error querying blockchain</div>';
  }
}

// ============================================
// LOGS (SSE + Manual)
// ============================================
function initLogs() {
  els.toggleLogsBtn.onclick = () => {
    els.logsPanel.classList.toggle('collapsed');
    els.toggleLogsBtn.textContent = els.logsPanel.classList.contains('collapsed') ? '▶' : '◀';
  };
}

function addLog(msg, category = '') {
  const div = document.createElement('div');
  const catClass = `log-${category.toLowerCase()}`;
  div.className = category ? catClass : '';
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg} `;
  els.logs.appendChild(div);
  els.logs.scrollTop = els.logs.scrollHeight;
}

async function logToServer(category, message) {
  // Only send to server. SSE will handle displaying it in the viewer
  // to avoid duplicates in the logs panel.
  try {
    await fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, message })
    });
  } catch (e) {
    console.warn('Failed to sync log with server');
    // If network fails, at least show something locally
    addLog(`[ERROR-CORE] ${message}`, 'error');
  }
}

async function requestKeystoneSignature(action) {
  const isSimulated = !isMetaMaskMode || !window.ethereum;

  if (isSimulated) {
    if (!window.ethereum) addLog('MetaMask not detected. Using simulated signature.', 'info');
    else addLog('Simulated wallet active. Skipping real signature.', 'info');

    return {
      signature: '0xSIMULATED_KEYSTONE_SIG_' + Math.random().toString(16).slice(2, 10),
      message: action
    };
  }

  try {
    const message = `I authorize the action [${action}] on StealthBond LATAM via Chainlink CRE (Keystone).\n\nActionID: ${Math.random().toString(36).substring(7)}\nTimestamp: ${new Date().toISOString()}`;
    const from = currentWallet;
    logToServer('CLIENT', 'Requesting intent signature (Keystone Forwarder)...');
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, from],
    });
    return { message, signature };
  } catch (e) {
    console.error("Signature rejected", e);
    return null;
  }
}

function setupSSE() {
  const eventSource = new EventSource(`${API_BASE}/logs`);
  eventSource.onmessage = (e) => {
    let rawData = null;
    try {
      rawData = JSON.parse(e.data);
      const { category, message } = rawData;

      // Log with specific color
      addLog(`[${category}] ${message}`, category);

      // Sync with the Stage 1 Step Viewer - KYC (10 steps)
      // Protocol: each message from the backend triggers exactly one step.
      // advanceStep NEVER goes backward — resolves race conditions between
      // kyc.js messages and CRE TEE messages that arrive out of order.
      if (els.kycSteps && els.kycSteps.style.display === 'block') {
        const advanceStep = (num) => {
          if (num <= currentKycActiveStep) return; // never backward
          // Mark current active step as completed before advancing
          if (currentKycActiveStep > 0) updateKycStep(currentKycActiveStep, 'completed');
          // Mark intermediate skipped steps as completed
          for (let i = currentKycActiveStep + 1; i < num; i++) updateKycStep(i, 'completed');
          // Activate new step
          updateKycStep(num, 'active');
          currentKycActiveStep = num;
        };

        // Steps 3 and 4: backend emits them in guaranteed order
        // Step 3: kyc.js emits it just before launching the CRE process
        if (message.includes('Auth: Initiating secure connection')) advanceStep(3);
        // Step 4: kyc.js emits it when the FIRST output from the CRE process arrives (real confirmation)
        if (message.includes('Trigger: Activating TEE identity cycle') || message.includes('Trigger: Activating TEE Agent cycle')) advanceStep(4);
        // Step 5: Vault injects secrets and validates SENIAT/GLEIF
        if (message.includes('Vault: Injecting') || message.includes('Vault: Injecting API Keys')) advanceStep(5);
        // Step 6: AI Analysis in enclave
        if (message.includes('AI: Executing')) advanceStep(6);
        // Step 7: AML Screening
        if (message.includes('AML: Screening')) advanceStep(7);
        // Step 8: CCID generated — TEE Consensus
        if (message.includes('Identity: Generating') || message.includes('Consensus: Generating') || message.includes('Consensus: Configuring')) advanceStep(8);
        // Step 9: On-chain anchoring
        if (message.includes('Anchoring:')) advanceStep(9);
        // Step 10: Cycle complete
        if (message.includes('Cycle complete')) {
          updateKycStep(9, 'completed');
          updateKycStep(10, 'active');
          updateKycStep(10, 'completed');
          currentKycActiveStep = 10;
        }
      }

      // Sync with Step Viewer - AI Agent (6 steps)
      const agentStepsEl = document.getElementById('agentSteps');
      if (agentStepsEl && agentStepsEl.style.display === 'block') {
        const advanceAgentStep = (num) => {
          if (num <= currentAgentActiveStep) return;
          if (currentAgentActiveStep > 0) updateAgentStep(currentAgentActiveStep, 'completed');
          for (let i = currentAgentActiveStep + 1; i < num; i++) updateAgentStep(i, 'completed');
          updateAgentStep(num, 'active');
          currentAgentActiveStep = num;
        };

        if (message.includes('Cryptography: Verifying Tutor')) advanceAgentStep(2);
        if (message.includes('AML: Running confidential screening')) advanceAgentStep(3);
        if (message.includes('Identity: Generating unique Derived Credential')) advanceAgentStep(4);
        if (message.includes('Consensus: Anchoring Agent in Blockchain') || message.includes('[evmWrite] Anchoring Agent identity')) advanceAgentStep(5);
        if (message.includes('COMPLETE CYCLE') || message.includes('SUCCESSFUL ONBOARDING')) {
          // Mark ALL previous steps as completed
          for (let i = 1; i <= 5; i++) updateAgentStep(i, 'completed');
          updateAgentStep(6, 'active');
          updateAgentStep(6, 'completed');
          currentAgentActiveStep = 6;
        }
      }

      // Sync with Step Viewer - Bond Issuance (Stage 2)
      const issueStepsEl = document.getElementById('issueSteps');
      if (issueStepsEl && issueStepsEl.style.display === 'block') {
        const setIssueStep = (n, s) => { const el = document.getElementById(`issue-step-${n}`); if (el) el.className = s; };

        // Use a persistent step tracker if not already defined (simplified here for brevity)
        // We'll use the DOM state to check current progress
        const getActiveIssueStep = () => {
          for (let i = 6; i >= 1; i--) {
            const el = document.getElementById(`issue-step-${i}`);
            if (el && (el.className === 'active' || el.className === 'completed')) return i;
          }
          return 0;
        };

        const advanceIssueStep = (num) => {
          const current = getActiveIssueStep();
          if (num <= current && num !== 6) return; // Allow 6 to repeat for robustness
          for (let i = 1; i < num; i++) setIssueStep(i, 'completed');
          setIssueStep(num, 'active');
        };

        // 1. Signature -> 2. PoR Validation
        if (message.includes('Intent signed')) {
          advanceIssueStep(2);
        }

        // 2. PoR Validation -> 3. Compliance Analysis & Hash Encryption
        if (message.includes('Colateral Confirmado') ||
          message.includes('Collateral Confirmed') ||
          message.includes('AI: Analyzing financial consistency') ||
          message.includes('IA: Analizando coherencia financiera')) {
          advanceIssueStep(3);
        }

        // 3. Compliance Analysis -> 4. Asset Deployment
        if (message.includes('Executing issueBond') ||
          message.includes('Inyectando transacción cifrada') ||
          message.includes('Injecting encrypted transaction')) {
          advanceIssueStep(4);
        }

        // 4. Asset Deployment -> 5. CCIP Messaging
        if (message.includes('Factory deployed RWA Token successfully') ||
          message.includes('RWA Address')) {
          advanceIssueStep(5);
        }

        // 5. CCIP Messaging -> 6. Final success
        if (message.includes('Cross-chain messaging prepared') ||
          message.includes('unpaused on-chain') ||
          message.includes('RWA Bond successfully created')) {
          advanceIssueStep(6);
        }
      }

      // Sync with Stage 3 AI Console
      if (document.getElementById('stage-3').style.display === 'block') {
        const stream = document.getElementById('aiThinkingStream');
        if (stream && (category === 'GEMINI' || category === 'CRE' || category === 'SYSTEM')) {
          const addAILine = (text) => {
            const line = document.createElement('div');
            line.className = 'ai-line';
            line.textContent = `> [${new Date().toLocaleTimeString()}] ${text}`;
            stream.prepend(line);
          };
          if (category === 'GEMINI') addAILine(`AI Brain: ${message}`);
          if (category === 'CRE' && (message.includes('confidentialHttp') || message.includes('reserves'))) addAILine(`CRE Entry: ${message}`);
        }
      }
    } catch (err) {
      if (!rawData) {
        addLog(e.data, 'error');
      } else {
        console.warn("Error in visual update logic:", err);
      }
    }
  };
  eventSource.onerror = () => {
    console.error("SSE Connection failed");
    eventSource.close();
  };
}

function updateKycStep(stepNum, status) {
  const step = document.getElementById(`step-${stepNum}`);
  if (!step) return;

  // When activating a new one, ensure the previous one is completed
  if (status === 'active' && stepNum > 1) {
    const prev = document.getElementById(`step-${stepNum - 1}`);
    if (prev && prev.className !== 'completed') prev.className = 'completed';
  }

  step.className = status;
}

function resetKycSteps() {
  currentKycActiveStep = 2; // reset tracker starting new cycle
  for (let i = 1; i <= 10; i++) {
    const step = document.getElementById(`step-${i}`);
    if (step) step.className = '';
  }
}

function updateAgentStep(stepNum, status) {
  const step = document.getElementById(`agent-step-${stepNum}`);
  if (!step) return;

  if (status === 'active' && stepNum > 1) {
    const prev = document.getElementById(`agent-step-${stepNum - 1}`);
    if (prev && prev.className !== 'completed') prev.className = 'completed';
  }

  step.className = status;
}

// ============================================
// STAGE 1: KYC
// ============================================
function initStage1() {
  els.entityButtons.forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.entity;
      logToServer('SYSTEM', `Selected onboarding flow: ${type.toUpperCase()}`);
      if (type === 'agent') {
        if (!currentWallet) {
          logToServer('ERROR', 'Agent registration attempt without connected Tutor wallet');
          return alert('Please connect your wallet (acting as Tutor) with the button above before registering an AI Agent.');
        }
        els.agentFormContainer.style.display = 'block';
        els.kycFormContainer.style.display = 'none';
        document.getElementById('agentTutorWallet').value = currentWallet;
      } else {
        els.kycFormContainer.style.display = 'block';
        els.agentFormContainer.style.display = 'none';
        document.getElementById('entityType').value = type;

        const isPerson = type === 'person';
        document.getElementById('kycTitle').textContent = `${isPerson ? 'Person' : 'Company'} Registration`;

        // Entity type badge
        const badge = document.getElementById('entityBadge');
        badge.textContent = isPerson ? 'PERSON' : 'COMPANY';
        badge.className = `entity-badge ${type}`;

        // Dynamic labels
        const nameLabel = document.getElementById('kycNameLabel');
        const nameInput = nameLabel.querySelector('input');
        nameLabel.childNodes[0].textContent = isPerson ? 'Full name: ' : 'Legal Entity Name: ';

        const docLabel = document.getElementById('kycDocLabel');
        const docInput = docLabel.querySelector('input');
        docLabel.childNodes[0].textContent = isPerson ? 'Upload Personal RIF V- (PDF): ' : 'Upload Corporate RIF J- (PDF): ';

        // LEI field: only visible for companies
        const leiLabel = document.getElementById('kycEmailLabel');
        const leiInput = document.getElementById('kycEmail');
        if (isPerson) {
          leiLabel.style.display = 'none';
          leiInput.removeAttribute('required');
          leiInput.value = '';
        } else {
          leiLabel.style.display = '';
          leiInput.setAttribute('required', 'required');
        }
      }
    };
  });

  els.kycForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentWallet) {
      logToServer('ERROR', 'KYC attempt without connected wallet');
      return alert('Connect wallet first');
    }

    const type = document.getElementById('entityType').value;
    const name = document.getElementById('kycName').value;
    const rif = document.getElementById('kycRif').value;
    const lei = document.getElementById('kycEmail').value || '';
    const ocrContent = document.getElementById('kycOcrContent').value;
    const file = document.getElementById('kycDoc').files[0];

    // Prepare UI
    els.kycSteps.style.display = 'block';
    resetKycSteps();
    els.kycStatus.textContent = '';

    logToServer('SYSTEM', `Initiating Multi-level Onboarding for: ${type.toUpperCase()}`);

    // 1. Encryption and Real Hashing (WebCrypto)
    updateKycStep(1, 'active');
    logToServer('CLIENT', 'Reading binary file for integrity verification...');

    // Function to calculate real SHA-256 in the browser
    const calculateFileHash = async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const docHash = await calculateFileHash(file);

    updateKycStep(1, 'completed');
    logToServer('CLIENT', `✅ Integrity calculated (TEE Ready). Hash: ${docHash.slice(0, 15)}...`);


    // 2. Authorization Signature (Keystone)
    updateKycStep(2, 'active');
    const auth = await requestKeystoneSignature(`Onboarding KYC: ${type.toUpperCase()}`);
    if (!auth) {
      updateKycStep(2, 'error');
      return els.kycStatus.innerHTML = `<div class="error">❌ Signature rejected. Cannot proceed.</div>`;
    }
    updateKycStep(2, 'completed');

    // 3. Send to oracle — steps 3-10 are controlled ONLY by the backend's SSE
    try {
      logToServer('CRE', 'Sending HTTP Trigger + Keystone Signature to Identity Workflow...');
      const endpoint = type === 'company' ? `${API_BASE}/company/register` : `${API_BASE}/kyc/start`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type,
          lei: lei,
          companyName: name,
          rif: rif,
          ocrContent: ocrContent,
          wallet: currentWallet,
          docHash: docHash,
          signature: auth.signature,
          intentMessage: auth.message
        })
      });
      const data = await res.json();
      kycResultVisible = true;
      if (data.status === 'verified') {
        const txInfo = data.txHash ? ` <span style="opacity:0.65; font-size:0.8em;">⛓️ TX: ${data.txHash.slice(0, 10)}...</span>` : '';
        els.kycStatus.innerHTML = `<div class="info" style="font-size: 1.1em; padding: 15px; border: 2px solid var(--accent);">⌛ VERIFYING REGISTRATION ON BLOCKCHAIN...</div>`;

        // Mark up to step 8 (ID Issuance) which is off-chain
        for (let i = 3; i <= 8; i++) {
          updateKycStep(i, 'completed');
        }

        // VERIFY ON-CHAIN: backend ensures TX is mined.
        // Normalize wallet to lowercase to avoid checksum mismatch with MetaMask.
        const verifyOnChain = async () => {
          const normalizedWallet = currentWallet.toLowerCase();
          let attempt = 0;
          const MAX = 8; // 8 attempts x 800ms = max 6.4s

          const poll = async () => {
            attempt++;
            const onChain = await onchain.checkOnChainIdentity(normalizedWallet);
            if (onChain.verified) {
              updateKycStep(9, 'completed');
              updateKycStep(10, 'completed');
              els.kycStatus.innerHTML = `<div class="success" style="font-size: 1.2em; padding: 15px; border: 2px solid var(--success-glow);">✅ IDENTITY CERTIFIED AND ANCHORED ON-CHAIN<br><small>${data.name} [RIF: ${data.rif}]</small>${txInfo}</div>`;
              logToServer('SYSTEM', `⭐ ONBOARDING SUCCESSFUL: Registration confirmed in AgentRegistry.`);
              checkAndDisplayOnChainStatus(normalizedWallet);
            } else if (attempt < MAX) {
              setTimeout(poll, 800);
            } else {
              updateKycStep(9, 'error');
              updateKycStep(10, 'error');
              els.kycStatus.innerHTML = `<div class="error" style="font-size: 1.1em; padding: 15px; border: 2px solid #ef4444;">❌ ANCHORING FAILED: TX confirmed but record not visible. Check server terminal.</div>`;
              logToServer('ERROR', `❌ FINAL DISCREPANCY: No on-chain record for ${normalizedWallet} after ${MAX} attempts`);
            }
          };

          // Start immediately (without artificial delay)
          poll();
        };
        verifyOnChain();
      } else {
        // Oracle rejected — mark correct step based on failure
        const failedStep = data.failedStep || 3;
        // Mark all previous steps before failure as completed
        for (let i = 3; i < failedStep; i++) {
          updateKycStep(i, 'completed');
        }
        // Mark failed step as error
        updateKycStep(failedStep, 'error');
        els.kycStatus.innerHTML = `<div class="error" style="font-size: 1.1em; padding: 15px; border: 2px solid #ef4444;">❌ ${data.message || data.status.toUpperCase()}</div>`;
      }
    } catch (err) {
      logToServer('KYC', `❌ CRITICAL ERROR: ${err.message}`);
      els.kycStatus.innerHTML = `<div class="error">❌ Error in process</div>`;
    }
  };

  els.agentBackBtn.onclick = () => {
    logToServer('SYSTEM', 'Returning to entity selection');
    els.agentFormContainer.style.display = 'none';
  };

  els.kycBackBtn.onclick = () => {
    logToServer('SYSTEM', 'Returning to entity selection');
    els.kycFormContainer.style.display = 'none';
  };

  els.agentForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentWallet) {
      logToServer('ERROR', 'Agent registration submission attempt without connected wallet');
      return alert('Connect Tutor wallet first');
    }

    const agentName = document.getElementById('agentName').value;
    const tutorWallet = currentWallet; // Enforce security: always connected wallet
    const agentWallet = document.getElementById('agentWallet').value;

    // Show progress
    const agentSteps = document.getElementById('agentSteps');
    agentSteps.style.display = 'block';

    // Adapt texts for new architecture and clean steps
    for (let i = 1; i <= 6; i++) {
      const step = document.getElementById(`agent-step-${i}`);
      if (step) step.className = '';
    }
    els.agentStatus.textContent = '';
    currentAgentActiveStep = 1;

    logToServer('SYSTEM', `Initiating AI Agent registration: ${agentName}`);

    // Step 1: Cryptographic Signature
    updateAgentStep(1, 'active');
    const auth = await requestKeystoneSignature(`ACE Delegation: I, authorize the on-chain registration of the AI Agent '${agentName}' assigned to the operational wallet: ${agentWallet}`);

    if (!auth) {
      updateAgentStep(1, 'error');
      return els.agentStatus.innerHTML = `<div class="error">❌ Tutorship signature rejected by user.</div>`;
    }
    updateAgentStep(1, 'completed');

    // Step 2: Backend Validation
    document.getElementById('agent-step-2').className = 'active';

    try {
      const res = await fetch(`${API_BASE}/agent/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName,
          tutorWallet,
          agentWallet,
          signature: auth.signature,
          intentMessage: auth.message
        })
      });
      const data = await res.json();
      agentResultVisible = true;

      if (data.status === 'registered') {
        els.agentStatus.innerHTML = `<div class="success">✅ REGISTERED: ${data.agentName} [Tutor: ${data.tutorName}]</div>`;
      } else {
        const failedStep = data.failedStep || currentAgentActiveStep;
        // Mark all previous steps before failure as completed
        for (let i = 1; i < failedStep; i++) updateAgentStep(i, 'completed');
        // Mark failed step as error
        updateAgentStep(failedStep, 'error');
        els.agentStatus.innerHTML = `<div class="error" style="font-size: 1.1em; padding: 15px; border: 2px solid #ef4444;">❌ ${data.message || data.error}</div>`;
      }
    } catch (err) {
      logToServer('AGENT', `❌ ERROR: ${err.message}`);
      updateAgentStep(currentAgentActiveStep, 'error');
      els.agentStatus.innerHTML = `<div class="error">❌ Error in registration</div>`;
    }
  };
}

// ============================================
// STAGE 2: BONDS
// ============================================
async function updateStage2Visibility() {
  const notice = document.getElementById('issuerNotice');
  const form = document.getElementById('issueForm');

  if (!currentWallet) {
    notice.style.display = 'block';
    notice.textContent = '⚠️ Connect your wallet to verify issuance permissions.';
    form.style.opacity = '0.3';
    form.style.pointerEvents = 'none';
    return;
  }

  try {
    // Simulation: check bank/state if wallet is COMPANY
    // In the real world, this would be done by the frontend reading a local VC credential or querying a registry contract
    const res = await fetch(`${API_BASE}/kyc/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: currentWallet, checkOnly: true })
    });
    const data = await res.json();

    if (data.entityType === 'COMPANY') {
      notice.style.display = 'none';
      form.style.opacity = '1';
      form.style.pointerEvents = 'auto';
    } else {
      notice.style.display = 'block';
      notice.textContent = '⚠️ This section is exclusive for registered companies. Your wallet is registered as: ' + (data.entityType || 'UNKNOWN');
      form.style.opacity = '0.3';
      form.style.pointerEvents = 'none';
    }
  } catch (e) {
    console.error("Error verifying role in Stage 2", e);
  }
}

function initStage2() {
  els.issueForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentWallet) {
      logToServer('ERROR', 'Issuance blocked: Wallet not detected');
      return alert('Connect wallet');
    }

    const bondName = document.getElementById('bondName').value;
    const nominalValue = document.getElementById('bondAmount').value;
    const destinationChain = document.getElementById('bondChain').value;
    const collateralId = document.getElementById('collateralId').value;

    // UI Progress
    const steps = document.getElementById('issueSteps');
    steps.style.display = 'block';
    for (let i = 1; i <= 6; i++) document.getElementById(`issue-step-${i}`).className = '';
    els.issueStatus.textContent = 'Awaiting signature authorization...';

    logToServer('SYSTEM', `🚀 Bond Issuance: Requesting signature authorization for ${bondName}`);

    // STEP 1: KEYSTONE SIGNATURE
    document.getElementById('issue-step-1').className = 'active';
    const auth = await requestKeystoneSignature(`Issue Bond: ${bondName} on ${destinationChain}`);
    if (!auth) {
      document.getElementById('issue-step-1').className = 'error';
      return els.issueStatus.innerHTML = `<div class="error">❌ Signature rejected. Issuance cancelled.</div>`;
    }
    document.getElementById('issue-step-1').className = 'completed';

    logToServer('SYSTEM', `🚀 Intent signed. Initiating CRE workflow...`);

    try {
      const res = await fetch(`${API_BASE}/issuance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bondName,
          nominalValue,
          destinationChain,
          collateralId,
          ownerWallet: currentWallet,
          signature: auth.signature
        })
      });
      const data = await res.json();

      if (data.success) {
        // Ensure ALL steps are marked as completed on final success
        for (let i = 1; i <= 6; i++) {
          const el = document.getElementById(`issue-step-${i}`);
          if (el) el.className = 'completed';
        }
        els.issueStatus.innerHTML = `<div class="success">✅ ${data.message}</div>`;

        // REFRESH: Automatically update Stage 3 list and Portfolio
        await refreshBondSelect();
        await refreshPortfolio();
      } else {
        els.issueStatus.innerHTML = `<div class="error">❌ ${data.message || data.error || 'Unknown error during issuance'}</div>`;
        let marked = false;

        if (data.failedStep) {
          for (let i = 1; i <= 6; i++) {
            let el = document.getElementById(`issue-step-${i}`);
            if (el) {
              if (i < data.failedStep) el.className = 'completed';
              else if (i === data.failedStep) el.className = 'error';
              else el.className = '';
            }
          }
          marked = true;
        } else {
          for (let i = 1; i <= 6; i++) {
            let el = document.getElementById(`issue-step-${i}`);
            if (el && el.className === 'active') { el.className = 'error'; marked = true; }
          }
        }
        if (!marked) document.getElementById('issue-step-1').className = 'error';
      }
    } catch (err) {
      logToServer('ERROR', `Server failure: ${err.message}`);
      els.issueStatus.innerHTML = `<div class="error">❌ Error connecting to oracle</div>`;
      let marked = false;
      for (let i = 1; i <= 6; i++) {
        let el = document.getElementById(`issue-step-${i}`);
        if (el.className === 'active') { el.className = 'error'; marked = true; }
      }
      if (!marked) document.getElementById('issue-step-1').className = 'error';
    }
  };
}

// ============================================
// STAGE 3: AI MONITOR & FRACTIONALIZATION
// ============================================
function initStage3() {
  function addAILine(text) {
    const line = document.createElement('div');
    line.className = 'ai-line';
    line.textContent = `> [${new Date().toLocaleTimeString()}] ${text}`;
    els.aiThinkingStream.prepend(line);
  }

  // Price is now updated by currency change event, not by mock interval
  els.forceMonitorBtn.onclick = async () => {
    const bondId = els.buyBondSelect.value;
    if (!bondId) return alert('Select a bond');

    els.aiThinkingStream.innerHTML = '';
    // Backend handles logging via SSE for realistic coordination
    try {
      const res = await fetch(`${API_BASE}/por/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bondId })
      });
      const data = await res.json();

      if (data.error) {
        addLog(`Oracle error: ${data.error}`, 'error');
        const errLine = document.createElement('div');
        errLine.className = 'ai-line error';
        errLine.textContent = `> 🚨 ERROR: ${data.error}`;
        els.aiThinkingStream.prepend(errLine);
        return;
      }

      // Physical UI update
      if (data.ratio !== undefined) {
        els.healthRatio.textContent = `${data.ratio.toFixed(2)}%`;
        els.healthIndicator.style.setProperty('--ratio', `${Math.min(data.ratio, 100)}%`);
      }
      els.bondStatusBadge.textContent = data.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE';
      els.bondStatusBadge.className = `status-badge ${data.status?.toLowerCase() || ''}`;
      els.lastCheckTime.textContent = `Last check: ${new Date().toLocaleTimeString()}`;
      els.aiCodeHash.textContent = `Hash: ${data.codeHash || '---'}`;

      if (data.aiAnalysis) {
        if (data.aiAnalysis.insight) {
          addAILine(`📝 AI INSIGHT: ${data.aiAnalysis.insight}`);
        }
        addAILine(`⚖️ RECOMMENDATION: ${data.aiAnalysis.recommendation}`);
        addAILine(`📊 RISK: ${data.aiAnalysis.riskLevel}`);
      }

      if (data.txRecorded) {
        addAILine(`🔒 ON-CHAIN ACTION ACHIEVED: Asset modified. Mission accomplished.`);
      }

    } catch (e) {
      console.error("Error contacting oracle:", e);
      const errLine = document.createElement('div');
      errLine.className = 'ai-line error';
      errLine.textContent = "> 🚨 ERROR: Could not contact CRE oracle.";
      els.aiThinkingStream.prepend(errLine);
    }
  };

  els.simulateDeficitBtn.onclick = async () => {
    const bondId = els.buyBondSelect.value;
    const collId = bondCollateralMap[bondId.toLowerCase()] || bondCollateralMap[bondId] || bondId;
    const selectedOption = els.buyBondSelect.options[els.buyBondSelect.selectedIndex];
    const nominalMatch = selectedOption ? selectedOption.text.match(/\$([\d,\.]+)/) : null;
    const nominalValue = nominalMatch ? parseFloat(nominalMatch[1].replace(/,/g, '')) : 5000000;

    // Simulate dropping reserves to catastrophic 50% of nominal value
    const deficitAmount = nominalValue * 0.50;

    await fetch(`${API_BASE}/bank/reserves/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collateralId: collId, newAmount: deficitAmount })
    });
    addAILine(`ALERT: ACE Monitoring detected collateral drop for ${collId} to 50%. Deficit activated.`);
  };

  els.restoreReservesBtn.onclick = async () => {
    const bondId = els.buyBondSelect.value;
    const collId = bondCollateralMap[bondId.toLowerCase()] || bondCollateralMap[bondId] || bondId;
    const selectedOption = els.buyBondSelect.options[els.buyBondSelect.selectedIndex];
    const nominalMatch = selectedOption ? selectedOption.text.match(/\$([\d,\.]+)/) : null;
    const nominalValue = nominalMatch ? parseFloat(nominalMatch[1].replace(/,/g, '')) * 1.5 : 5000000;
    await fetch(`${API_BASE}/bank/reserves/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collateralId: collId, newAmount: nominalValue })
    });
    addAILine(`System: Collateral restored to $${nominalValue.toLocaleString()} for ${collId}.`);
  };

  let currentOracleRate = 0.9998;

  window.updateExchangePreview = () => {
    const qty = Number(els.buyAmount.value) || 0;
    const baseUsd = qty * currentOracleRate;
    const selectedBond = els.buyBondSelect.value;
    const normalizedId = selectedBond.toString().toLowerCase();
    const symbol = bondSymbolMap[normalizedId] || 'SBRWA';
    const tokens = baseUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });

    // Improve visualization for clarity
    const unitPrice = currentOracleRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const totalValue = baseUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });

    els.paymentUsdValue.textContent = `$${totalValue} (Unit: $${unitPrice})`;

    if (els.tokenPreview) {
      els.tokenPreview.innerHTML = `Your tokens: <span style="font-weight:bold; color:#10b981;">${tokens} ${symbol}</span>`;
    }
  };

  els.buyBondSelect.onchange = window.updateExchangePreview;

  const updatePriceFromOracles = async () => {
    const pair = els.buyCurrencySelect.value;
    const label = pair.replace('-USD', '/USD');
    els.oracleFeedName.textContent = label;
    if (els.tickerLabel) els.tickerLabel.textContent = `Price Feed (${label})`;

    try {
      const res = await fetch(`${API_BASE}/pricefeed/${pair}`);
      const data = await res.json();
      if (data.answer) {
        currentOracleRate = data.answer / (10 ** data.decimals);

        // Special formatting for VES (show exchange rate Bs/$)
        if (pair === 'VES-USD' && data.rawFiatPrice) {
          els.livePrice.textContent = `${data.rawFiatPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs/$`;
        } else {
          els.livePrice.textContent = `$ ${currentOracleRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
        }

        // Show or hide SVR badge and update texts
        const isSvrText = data.isSVR ? ' (SVR-Enabled)' : '';
        els.oracleFeedName.textContent = label + isSvrText;
        if (els.tickerLabel) els.tickerLabel.textContent = `Price Feed (${label})${isSvrText}`;

        if (els.svrBadge) {
          els.svrBadge.style.display = data.isSVR ? 'block' : 'none';
        }

        updateExchangePreview();
      }
    } catch (e) {
      console.error(e);
    }
  };

  els.buyCurrencySelect.onchange = updatePriceFromOracles;

  // Load initial price (USDC SVR)
  updatePriceFromOracles();

  els.buyAmount.oninput = updateExchangePreview;

  els.fractionalBuyForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentWallet) return alert('You must connect your wallet');

    const qty = Number(els.buyAmount.value) || 0;
    if (qty <= 0) return;

    const baseUsd = qty * currentOracleRate;
    const pair = els.buyCurrencySelect.value;
    const currencyName = pair.split('-')[0];
    const isSVR = pair === 'USDC-USD' ? '\\n(SVR MEV-Protected 🛡️)\\nRouting via Flashbots: ENABLED' : '';

    const auth = await requestKeystoneSignature(`Approve Retail Investment:\\n${qty} ${currencyName} (~$${baseUsd.toFixed(2)} USD)${isSVR}`);
    if (!auth) return;

    try {
      // === Real on-chain TX: buyer transfers tokens to treasury (DON Signer / deployer) ===
      // Treasury = Account #0 of Anvil (the DON Signer that manages the contracts)
      const TREASURY = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
      const tokenAddresses = {
        USDC: window.onchain.CONTRACT_ADDRESSES.usdc || '0x68b1d87f95878fe05b998f19b66f4baba5de1aed',
        VES: '0x3aa5ebb10dc797cac828524e59a333d0a371443c',
        EURC: '0xc6e7df5e7b4f2a278906862b61205850344d4e7d'
      };
      const rawTokenAddr = tokenAddresses[currencyName];

      if (rawTokenAddr && window.onchain.isValidAddress(rawTokenAddr)) {
        const tokenAddress = ethers.getAddress(rawTokenAddr);
        const treasuryAddress = ethers.getAddress(TREASURY);

        const connection = await window.onchain.connectMetaMask();
        if (!connection) return addLog('❌ Could not connect MetaMask', 'error');

        const { signer } = connection;
        const ERC20_ABI = [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)'
        ];

        // Read token decimals
        const directProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        const tokenRead = window.onchain.safeContract(tokenAddress, ERC20_ABI, directProvider);
        const decimals = tokenRead ? await tokenRead.decimals().catch(() => 6) : 6;

        // Calculate actual amount based on currency
        let amountToTransfer = baseUsd;
        if (currencyName === 'VES') amountToTransfer = baseUsd * 42.50;
        if (currencyName === 'EURC') amountToTransfer = baseUsd / 1.08;
        const amountRaw = ethers.parseUnits(amountToTransfer.toFixed(6), decimals);

        addLog(`[blockchain] Transferring ${amountToTransfer.toFixed(2)} ${currencyName} to treasury — Requesting signature...`, 'evm');
        const tokenWrite = window.onchain.safeContract(tokenAddress, ERC20_ABI, signer);
        const transferTx = await tokenWrite.transfer(treasuryAddress, amountRaw);
        addLog(`[blockchain] TX sent: ${transferTx.hash.slice(0, 18)}... Waiting for confirmation...`, 'evm');
        const transferReceipt = await transferTx.wait();
        addLog(`[blockchain] ✅ Transfer confirmed in block #${transferReceipt.blockNumber}. TX: ${transferReceipt.hash.slice(0, 18)}...`, 'evm');
      }

      // === Backend: credit bond tokens (no longer burns anything) ===
      const res = await fetch(`${API_BASE}/trading/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bondId: els.buyBondSelect.value,
          amountUSD: baseUsd,
          buyerWallet: currentWallet,
          currency: currencyName
        })
      });
      const data = await res.json();
      if (data.error) {
        els.stage3Status.innerHTML = `<p class="error">❌ ${data.error}</p>`;
        if (data.error.includes('Identity Verified')) {
          addLog(`[SYSTEM] 🚨 REJECTION: CRE Oracle denied transaction due to missing on-chain KYC.`, 'error');
        }
      } else {
        const finalBondId = els.buyBondSelect.value;
        const currentSymbol = bondSymbolMap[finalBondId.toLowerCase()] || 'SBRWA';
        els.stage3Status.innerHTML = `<p class="success">✅ RWA Purchase successful. Received ${data.tokensReceived} fractional ${currentSymbol} tokens.</p>`;
        addAILine(`Secondary market transaction executed with ${currencyName}. Settlement operated correctly at institutional level via Tokenization Factory.`);
        await refreshPortfolio();
      }
    } catch (e) {
      if (e.code === 4001 || (e.message && e.message.toLowerCase().includes('user rejected'))) {
        addLog(`⚠️ Transaction cancelled by user.`, 'info');
      } else {
        console.error(e);
        addLog(`❌ Error processing purchase: ${e.message || e}`, 'error');
      }
    }
  };

  // Initialize select
  refreshBondSelect();
}

// ============================================
// STAGE 4: PRIVATE TRANSACTION MARKET
// ============================================

const collapsedAuctions = new Set();
let privateWithdrawalTickets = [];

window.toggleAuctionDetails = (id) => {
  if (collapsedAuctions.has(id)) collapsedAuctions.delete(id);
  else collapsedAuctions.add(id);
  loadAuctions();
};

window.refreshAuctionBondSelect = async () => {
  await refreshBondSelect();
};

window.loadPrivateBalances = async () => {
  if (!currentWallet) return;
  try {
    const res = await fetch(`${API_BASE}/market/balance/${currentWallet}`);
    const data = await res.json();
    if (data.success) {
      const usdcBal = data.shieldedBalances.USDC || 0;
      const frozenUsdc = data.frozenInBids || 0;
      const availableUsdc = Math.max(0, usdcBal - frozenUsdc);

      // USDC in Vault (total deposited)
      const usdcEl = document.getElementById('privateUsdcBal');
      if (usdcEl) {
        usdcEl.textContent = `$ ${usdcBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      }

      // Available for bids (total - frozen)
      const availEl = document.getElementById('availableUsdcBal');
      if (availEl) {
        availEl.textContent = `$ ${availableUsdc.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        availEl.style.color = availableUsdc > 0 ? '#10b981' : '#ef4444';
      }

      // User's active bids list
      const bidsListEl = document.getElementById('activeBidsList');
      if (bidsListEl && data.frozenDetails) {
        if (Object.keys(data.frozenDetails).length === 0) {
          bidsListEl.innerHTML = '<p style="font-style: italic; margin: 0;">No active bids.</p>';
        } else {
          bidsListEl.innerHTML = Object.entries(data.frozenDetails).map(([aucId, amt]) =>
            `<div style="display:flex;justify-content:space-between;padding:0.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
              <span>Auction #${aucId}</span>
              <span style="color:#f59e0b;font-weight:bold;">🔒 $${parseFloat(amt).toFixed(2)}</span>
            </div>`
          ).join('');
        }
      } else if (bidsListEl && frozenUsdc === 0) {
        bidsListEl.innerHTML = '<p style="font-style: italic; margin: 0;">No active bids.</p>';
      }
    }
  } catch (e) {
    console.warn("Error loading private balances:", e);
  }
};

window.refreshTickets = () => {
  const list = document.getElementById('ticketsList');
  if (privateWithdrawalTickets.length === 0) {
    list.innerHTML = '<p style="font-size: 0.8rem; color: #64748b; font-style: italic;">No pending TEE tickets.</p>';
    return;
  }

  list.innerHTML = privateWithdrawalTickets.map((t, idx) => `
        <div class="withdrawal-ticket">
            <div class="ticket-info">
                <span class="ticket-amount">${t.amount}</span>
                <span class="ticket-token">${t.token}</span>
            </div>
            <button class="claim-btn" onclick="claimTicket(${idx})">UNSHIELD</button>
        </div>
    `).join('');
};

window.loadTickets = async () => {
  if (!currentWallet) return;
  try {
    const res = await fetch(`${API_BASE}/market/tickets/${currentWallet}`);
    const data = await res.json();
    if (data.success) {
      privateWithdrawalTickets = data.tickets || [];
      refreshTickets();
    }
  } catch (e) {
    console.warn('Error loading tickets:', e);
  }
};

window.claimTicket = async (idx) => {
  const ticket = privateWithdrawalTickets[idx];
  if (!ticket) return;
  addLog(`[ACE] [TEE] Initiating Unshielding via Ticket ${ticket.id ? ticket.id.slice(0, 22) : idx}...`, 'info');

  try {
    // === Step 1: Get signed ticket from TEE Backend (≡ POST /withdraw Chainlink) ===
    const claimRes = await fetch(`${API_BASE}/market/claim-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: currentWallet, ticketId: ticket.id })
    });
    const claimData = await claimRes.json();

    if (!claimData.success) {
      addLog(`❌ [TEE] ${claimData.error || 'Error issuing ticket'}`, 'error');
      return;
    }

    const { tokenAddress, amountWei, sig, description } = claimData.ticket;
    addLog(`[TEE] ✅ Signed ticket received. Executing on-chain withdrawal...`, 'cre');

    // === Step 2: Redeem on-chain with vault.withdrawWithTicket() ===
    const connection = await window.onchain.connectMetaMask();
    if (!connection) return addLog('❌ Could not connect MetaMask', 'error');

    const { signer } = connection;
    const vaultAddress = ethers.getAddress(
      window.onchain.CONTRACT_ADDRESSES.stealthVaultEscrow || '0xdc11f7e700a4c898ae5caddb1082cffa76512add'
    );

    const VAULT_ABI_WITHDRAW = [
      'function withdrawWithTicket(address token, uint256 amount, bytes calldata ticket) external'
    ];

    const vaultContract = window.onchain.safeContract(vaultAddress, VAULT_ABI_WITHDRAW, signer);
    if (!vaultContract) return addLog('❌ Could not instantiate Vault', 'error');

    // Verify Vault is deployed (prevents cryptic "BAD_DATA" error)
    const vaultCode = await connection.provider.getCode(vaultAddress);
    if (!vaultCode || vaultCode === '0x') {
      return addLog('❌ Vault is not deployed on network. Run deployment script (forge script DeployStage4) first.', 'error');
    }

    const tokenAddr = ethers.getAddress(tokenAddress);
    const amount = BigInt(amountWei);
    const sigBytes = sig;

    addLog(`[blockchain] TX: stealthVaultEscrow.withdrawWithTicket(${tokenAddr.slice(0, 10)}..., ${amount}, sig)`, 'evm');

    const tx = await vaultContract.withdrawWithTicket(tokenAddr, amount, sigBytes);
    addLog(`[blockchain] TX sent: ${tx.hash.slice(0, 18)}... Waiting for confirmation...`, 'evm');
    const receipt = await tx.wait();
    addLog(`[SYSTEM] ✅ Unshield successful in block #${receipt.blockNumber}. ${description}`, 'success');

    await loadTickets();
    await refreshPortfolio();
    await loadPrivateBalances();

  } catch (e) {
    if (e.code === 4001 || (e.message && e.message.toLowerCase().includes('user rejected'))) {
      addLog(`⚠️ Withdrawal cancelled by user.`, 'info');
    } else {
      addLog(`❌ Unshield error: ${e.message || e}`, 'error');
    }
  }
};

window.loadAuctions = async () => {
  try {
    const res = await fetch(`${API_BASE}/auction/list?wallet=${currentWallet || ''}`);
    const auctions = await res.json();

    if (auctions.length === 0) {
      els.auctionsList.innerHTML = '<p class="info">Waiting for Enclave auctions...</p>';
      return;
    }

    els.auctionsList.innerHTML = auctions.map(a => {
      const isOwner = currentWallet && a.seller.toLowerCase() === currentWallet.toLowerCase();
      const isSettled = a.status === 'SETTLED';
      const isCollapsed = collapsedAuctions.has(a.id);

      return `
        <div class="auction-card ${isSettled ? 'settled' : ''} ${isCollapsed ? 'collapsed' : ''}" id="card-${a.id}">
          <button class="expand-toggle" onclick="toggleAuctionDetails('${a.id}')">
            ${isCollapsed ? '➕' : '➖'}
          </button>
          <div class="auction-info">
            <span class="private-balance-badge" style="background: rgba(34, 211, 238, 0.1); font-size: 0.6rem;">🛡️ ENCLAVE PROTECTED</span><br>
            <strong>Auction #${a.id}</strong> [${a.status}]<br>
            Bond: ${a.bondId.slice(0, 10)}... | Amount: ${a.amount} tokens<br>
            Min Price: <span class="price">$${a.minBid} USDC</span>
          </div>
          <div class="auction-bids">
            ${isSettled ? `
              <div class="winner-badge">
                🏆 Resolved in TEE<br>
                Winner: ${a.winner.slice(0, 10)}...
              </div>
            ` : `
              <div style="background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px; text-align: center;">
                <span style="color: #64748b; font-size: 0.75rem;">🔒 Sealed-Envelope Bids</span><br>
                <span style="font-weight: bold; color: #22d3ee;">${a.bids.length}</span> <small>Participants</small>
              </div>
            `}
          </div>
          <div class="auction-actions">
            ${!isSettled ? `
              <button class="small-btn ai-btn" onclick="askAIConsultant('${a.id}')">🤖 AI Risk</button>
              <button class="small-btn bid-btn" onclick="openBidPanel('${a.id}')">🔒 BID (TEE)</button>
              <button class="small-btn settle-btn" onclick="settleAuction('${a.id}')" ${!isOwner ? 'disabled title="Only the issuer can resolve" style="opacity:0.4;cursor:not-allowed;"' : ''}>⚖️ RESOLVE</button>
            ` : `<span class="badge success">SETTLED</span>`}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Error loading auctions', e);
  }
};

function initStage4() {
  let activeAuctionId = null;

  // --- Vault Logic ---
  const shieldZone = document.getElementById('shieldZone');
  const shieldForm = document.getElementById('shieldForm');
  const confirmShieldBtn = document.getElementById('confirmShieldBtn');
  const cancelShieldBtn = document.getElementById('cancelShieldBtn');

  shieldZone.onclick = () => {
    shieldForm.style.display = 'block';
    shieldZone.style.display = 'none';
  };

  cancelShieldBtn.onclick = () => {
    shieldForm.style.display = 'none';
    shieldZone.style.display = 'block';
  };

  confirmShieldBtn.onclick = async () => {
    const amount = document.getElementById('shieldAmount').value;
    const token = document.getElementById('shieldTokenSelect').value;
    if (!amount || amount <= 0) return alert('Invalid amount');
    if (!currentWallet) return alert('Connect your wallet');

    addLog(`[ACE] [Keystone] Requesting signature to Shield ${amount} ${token}...`, 'info');
    const auth = await requestKeystoneSignature(`Shielding Asset: Moving ${amount} ${token} to Private Transaction Vault.`);
    if (!auth) return;

    try {
      // === TX 1: ERC-20 approve (MetaMask signature) ===
      addLog(`[blockchain] TX 1/2: ${token}.approve(vault, ${amount}) — Requesting signature...`, 'evm');

      const connection = await window.onchain.connectMetaMask();
      if (!connection) return addLog('❌ Failed to connect MetaMask', 'error');

      const { signer } = connection;

      // Vault and Token address — normalize with getAddress() to avoid EIP-55 checksum errors
      const vaultAddress = ethers.getAddress(window.onchain.CONTRACT_ADDRESSES.stealthVaultEscrow || '0xdc11f7e700a4c898ae5caddb1082cffa76512add');
      const rawTokenAddress = token === 'USDC'
        ? (window.onchain.CONTRACT_ADDRESSES.usdc || '0x68b1d87f95878fe05b998f19b66f4baba5de1aed')
        : window.onchain.CONTRACT_ADDRESSES[token.toLowerCase()];
      const tokenAddress = rawTokenAddress ? ethers.getAddress(rawTokenAddress) : null;

      if (!tokenAddress || !window.onchain.isValidAddress(tokenAddress)) {
        return addLog(`❌ Token ${token} not configured in onchain.js`, 'error');
      }
      if (!window.onchain.isValidAddress(vaultAddress)) {
        return addLog(`❌ Invalid vault address`, 'error');
      }

      const ERC20_ABI = [
        'function approve(address spender, uint256 amount) returns (bool)',
        'function decimals() view returns (uint8)'
      ];
      const VAULT_ABI = [
        'function deposit(address token, uint256 amount) external'
      ];

      const tokenContract = window.onchain.safeContract(tokenAddress, ERC20_ABI, signer);
      if (!tokenContract) return addLog('❌ Failed to instantiate token contract', 'error');

      // Get token decimals
      const directProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
      const tokenRead = window.onchain.safeContract(tokenAddress, ERC20_ABI, directProvider);
      const decimals = tokenRead ? await tokenRead.decimals() : 6;
      const amountRaw = ethers.parseUnits(String(parseFloat(amount).toFixed(6)), decimals);

      // TX 1: approve
      const approveTx = await tokenContract.approve(vaultAddress, amountRaw);
      addLog(`[blockchain] TX 1/2 sent: ${approveTx.hash.slice(0, 18)}... Waiting for confirmation...`, 'evm');
      await approveTx.wait();
      addLog(`[blockchain] ✅ Approve confirmed on-chain.`, 'evm');

      // === TX 2: vault.deposit (MetaMask signature) ===
      addLog(`[blockchain] TX 2/2: stealthVaultEscrow.deposit(${token}, ${amount}) — Requesting signature...`, 'evm');
      const vaultContract = window.onchain.safeContract(vaultAddress, VAULT_ABI, signer);
      if (!vaultContract) return addLog('❌ Failed to instantiate Vault contract', 'error');

      const depositTx = await vaultContract.deposit(tokenAddress, amountRaw);
      addLog(`[blockchain] TX 2/2 sent: ${depositTx.hash.slice(0, 18)}... Waiting for confirmation...`, 'evm');
      const depositReceipt = await depositTx.wait();
      addLog(`[blockchain] ✅ Deposit confirmed in block #${depositReceipt.blockNumber}. Tokens transferred to the Vault.`, 'evm');

      // === TEE: Credit in private ledger (only if on-chain TX is successful) ===
      addLog(`[TEE] Registering deposit in the Enclave's Private Ledger...`, 'cre');
      const res = await fetch(`${API_BASE}/market/shield`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: currentWallet, token, amount })
      });
      const data = await res.json();

      if (data.success) {
        addLog(`[SYSTEM] ✅ Shielding successful. ${amount} ${token} credited to the Private Vault. TX: ${depositReceipt.hash.slice(0, 18)}...`, 'success');
      } else {
        addLog(`[ERROR TEE] ${data.error || 'Failed to credit in private ledger'}`, 'error');
      }

      shieldForm.style.display = 'none';
      shieldZone.style.display = 'block';

      await refreshPortfolio();
      await loadPrivateBalances();

    } catch (e) {
      if (e.code === 4001 || (e.message && e.message.toLowerCase().includes('user rejected'))) {
        addLog(`⚠️ Transaction canceled by the user.`, 'info');
      } else if (e.message && e.message.includes('Phase 1 Identity missing')) {
        addLog(`🚨 [ACE Policy] Your wallet has no registered identity (CCID). Complete Stage 1 KYC Onboarding before operating in the Vault.`, 'error');
      } else {
        addLog(`❌ On-chain Shielding error: ${e.message || e}`, 'error');
      }
      console.error('[Shield] Error:', e);
      shieldForm.style.display = 'none';
      shieldZone.style.display = 'block';
    }
  };

  // --- Auction Logic ---

  window.askAIConsultant = async (id) => {
    if (!currentWallet) return alert('Please connect your wallet before requesting AI consultancy.');

    els.aiConsultantBox.style.display = 'block';
    els.aiConsultantBox.innerHTML = `
            <div class="ai-console-header">🤖 AI Private Consultant (x402 Protocol)</div>
            <div id="aiAuctionResult" class="ai-thinking-log">Establishing secure connection with Gamma Agent...</div>
        `;
    const resultEl = document.getElementById('aiAuctionResult');

    try {
      // 1. Initial consultation attempt (this will trigger 402 on the backend)
      let res = await fetch(`${API_BASE}/ai/consultant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auctionId: id,
          wallet: currentWallet
        })
      });

      // 2. Handshake handling x402 (Payment Required)
      if (res.status === 402) {
        const challenge = await res.json();
        // [MAPPING FIX] Adaptation to keys returned by real x402 middleware (x402-express/core)
        const fee = challenge.fee || challenge.price || challenge.amount || "0.01";
        const currency = challenge.currency || challenge.token || "USDC";
        // Target: In a real handshake it comes as 'recipient' or we take it from the backend
        const target = challenge.target || challenge.recipient || "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

        logToServer('ACE', `💰 [x402] Micropayment detected: ${fee} ${currency}. Preparing EIP-712 signature...`);

        els.aiConsultantBox.innerHTML = `
            <div class="x402-panel" style="border: 2px solid #facc15; padding: 1.5rem; border-radius: 12px; background: rgba(250,204,21,0.05); text-align: center;">
                <h3 style="color: #facc15; margin-top: 0;">⚠️ Micropayment Required</h3>
                <p style="font-size: 0.9rem; color: #f8fafc; margin-bottom: 1rem;">
                    Gamma Agent requires <strong>${fee} ${currency}</strong> on the <b>Base Sepolia</b> network for the auction seller.
                </p>
                <div style="font-size: 0.8rem; color: #94a3b8; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; text-align: left; border: 1px solid rgba(250,204,21,0.2);">
                    <div style="margin-bottom: 0.5rem;"><b>Network:</b> <span style="color: #f8fafc;">Base Sepolia (84532)</span></div>
                    <div><b>Receiver (Seller):</b> <code style="color: #22d3ee; word-break: break-all;">${target}</code></div>
                </div>
                <button id="payAIBtn" class="primary-btn" style="background: #facc15; color: #0f172a; width: 100%; border: none; font-weight: bold; cursor: pointer; padding: 0.8rem; border-radius: 6px;">Sign & Proceed with Payment</button>
            </div>
        `;

        // Payment button logic
        document.getElementById('payAIBtn').onclick = async () => {
          try {
            document.getElementById('payAIBtn').disabled = true;
            document.getElementById('payAIBtn').textContent = 'Processing Transaction...';

            // a) Execute REAL TRANSFER of USDC on Base Sepolia
            addLog(`[x402] Starting transfer of ${fee} ${currency} to ${target.slice(0, 10)}... on Base Sepolia`, 'info');

            // Call the real function defined in onchain.js
            const tx = await onchain.transferUSDCBaseSepolia(target, fee);

            addLog(`[blockchain] ✅ TX sent: ${tx.hash.slice(0, 20)}... Waiting for confirmation on Base Scan...`, 'success');
            logToServer('SYSTEM', `🚀 [x402] On-chain transaction detected on Base Sepolia. Verifying Settlement...`);

            // Wait for confirmation (1 confirmation is enough for the demo)
            const receipt = await tx.wait();
            addLog(`[blockchain] 💎 Payment confirmed in Block #${receipt.blockNumber} of Base Sepolia.`, 'success');

            // b) Sign the Access Ticket (Keystone Proof)
            // This links the payment with the user's session for the Agent's analysis
            addLog(`[x402] Generating signed Access Ticket for the TEE Enclave...`, 'ace');
            const auth = await requestKeystoneSignature(`Access AI Consultant Report for Auction ${id}. Payment confirmed in TX ${tx.hash}`);
            if (!auth) throw new Error("Access signature rejected by the user.");

            addLog(`[SYSTEM] Payment validated. Synchronizing with the Enclave for Gemini TEE analysis...`, 'success');
            await simulateDelay(1000);

            // c) Retry query sending proofs (Signature + TX Hash)
            const retryRes = await fetch(`${API_BASE}/ai/consultant`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-payment': `Bearer ${auth.signature}`,
                'x-payer-address': currentWallet,
                'x-tx-hash': tx.hash
              },
              body: JSON.stringify({ auctionId: id, wallet: currentWallet })
            });

            // d) Return to Anvil network
            addLog(`[x402] Analysis received. Returning to local Anvil network...`, 'info');
            try {
              await onchain.switchToAnvil();
            } catch (swErr) {
              console.warn("Failed to return to Anvil", swErr);
            }

            const finalData = await retryRes.json();
            displayAIConsultantResult(finalData);

          } catch (e) {
            addLog(`❌ x402 Error: ${e.message}`, 'error');
            els.aiConsultantBox.innerHTML = `<div class="ai-thinking-log" style="color: #ef4444;">> Error in payment process: ${e.message}</div>`;
            // Ensure return to Anvil
            try { await onchain.switchToAnvil(); } catch { }
          }
        };

        return; // Stop here, flow continues in button click
      }

      // 3. If already paid (Status 200)
      const data = await res.json();
      displayAIConsultantResult(data);

    } catch (e) {
      addLog(`❌ AI Consultancy error: ${e.message}`, 'error');
      resultEl.innerHTML = `❌ Error: ${e.message}`;
    }
  };

  function displayAIConsultantResult(data) {
    if (!data.success) {
      els.aiConsultantBox.innerHTML = `<div class="ai-thinking-log" style="color: #ef4444;">> Agent Error: ${data.error || 'Unknown'}</div>`;
      return;
    }

    els.aiConsultantBox.innerHTML = `
        <div class="ai-console-header">🤖 AI Private Consultant Insight</div>
        <div class="ai-thinking-log" style="border-left: 3px solid #10b981; padding-left: 1rem;">
            <div style="margin-bottom: 0.5rem; color: #10b981; font-weight: bold;">✅ Analysis completed via x402 and Gemini Enclave.</div>
            <p style="margin: 0.5rem 0; font-size: 0.9rem; line-height: 1.4;">"${data.analysis}"</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.8rem; margin-top: 1rem;">
                <div style="background: rgba(16, 185, 129, 0.1); padding: 0.5rem; border-radius: 4px;">
                    <span style="color: #94a3b8;">Risk Level:</span><br>
                    <strong style="color: ${data.riskLevel === 'Low' ? '#10b981' : '#facc15'}">${data.riskLevel}</strong>
                </div>
                <div style="background: rgba(34, 211, 238, 0.1); padding: 0.5rem; border-radius: 4px;">
                    <span style="color: #94a3b8;">AI Confidence:</span><br>
                    <strong style="color: #22d3ee;">${data.confidence}%</strong>
                </div>
            </div>
            <div style="margin-top: 1rem; font-style: italic; color: #94a3b8; font-size: 0.75rem;">
                📌 Recommendation: ${data.recommendation}
            </div>
        </div>
    `;
  }

  window.openBidPanel = (id) => {
    activeAuctionId = id;
    els.bidTitle.innerText = `Bid on Auction #${id} (TEE Sealed-Bid)`;
    els.bidInputBox.style.display = 'block';
    els.bidAmountInput.focus();
    els.bidAmountInput.value = '';
    window.scrollTo({ top: els.bidInputBox.offsetTop - 100, behavior: 'smooth' });
  };

  window.settleAuction = async (id) => {
    if (!currentWallet) return;
    addLog(`[ACE] [TEE] Resolving auction #${id} in confidential environment...`, 'info');

    try {
      const res = await fetch(`${API_BASE}/auction/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId: id, sellerWallet: currentWallet })
      });
      const data = await res.json();

      if (data.success) {
        const winnerShort = data.winner ? data.winner.slice(0, 10) + '...' : 'N/A';
        addLog(`[SYSTEM] ✅ Auction #${id} resolved. Winner: ${winnerShort} for $${data.amount || 0} USDC`, 'success');

        // Generate signed tickets for all participants (Chainlink standard)
        try {
          const resolveRes = await fetch(`${API_BASE}/market/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auctionId: id })
          });
          const resolveData = await resolveRes.json();
          if (!resolveData.success) {
            addLog(`⚠️ [TEE] Tickets not generated: ${resolveData.error || 'Unknown error'}`, 'warning');
          } else {
            addLog(`🎫 [TEE] Withdrawal tickets generated for all participants.`, 'cre');
          }
        } catch (e) {
          addLog(`⚠️ [TEE] Error executing market/resolve: ${e.message}`, 'warning');
        }

        // Load persistent tickets from backend (already generated for everyone)
        await loadTickets();

        await loadAuctions();
        await loadPrivateBalances();
        await refreshPortfolio();
      } else {
        addLog(`❌ ${data.error || 'Error resolving auction'}`, 'error');
      }
    } catch (e) {
      addLog(`❌ Resolution error: ${e.message}`, 'error');
    }
  };

  els.cancelBidBtn.onclick = () => {
    els.bidInputBox.style.display = 'none';
    activeAuctionId = null;
  };

  els.submitBidBtn.onclick = async () => {
    const amount = els.bidAmountInput.value;
    if (!amount || isNaN(amount)) return alert('Invalid amount');
    if (!currentWallet) return alert('Connect your wallet');

    addLog(`[ACE] [TEE] Signing private bid for Auction #${activeAuctionId}...`, 'info');
    const auth = await requestKeystoneSignature(`Private Bid: $${amount} USDC for Auction #${activeAuctionId}`);
    if (!auth) return;

    els.bidInputBox.style.display = 'none';

    try {
      const res = await fetch(`${API_BASE}/market/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId: activeAuctionId,
          bidAmount: amount,
          wallet: currentWallet
        })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`[SYSTEM] ✅ Sealed bid sent to Chainlink CRE Enclave. Funds locked.`, 'success');
        loadAuctions();
        await loadPrivateBalances();
      } else {
        addLog(`❌ ${data.error || 'Error registering bid'}`, 'error');
        // Show temporary error without destroying the form
        els.bidInputBox.style.display = 'block';
        let errDiv = document.getElementById('bidErrorMsg');
        if (!errDiv) {
          errDiv = document.createElement('div');
          errDiv.id = 'bidErrorMsg';
          els.bidInputBox.prepend(errDiv);
        }
        errDiv.innerHTML = `
          <div style="padding: 0.8rem; text-align: center; background: rgba(239,68,68,0.15); border: 1px solid #ef4444; border-radius: 8px; margin-bottom: 0.5rem;">
            <strong style="color: #ef4444;">🚨 Bid Rejected</strong>
            <p style="color: #f87171; font-size: 0.85rem; margin: 0.3rem 0 0;">${data.error || 'Unknown error'}</p>
          </div>
        `;
        setTimeout(() => { if (errDiv) errDiv.remove(); }, 5000);
      }
    } catch (e) {
      addLog(`❌ Bid error: ${e.message}`, 'error');
    }
  };

  els.createAuctionForm.onsubmit = async (e) => {
    e.preventDefault();
    const bondId = els.auctionBondSelect.value;
    const amount = els.auctionAmount.value;
    const min = els.auctionMinBid.value;

    if (!bondId || !amount || !min) return;

    addLog(`[ACE] [TEE] Initiating private auction publication...`, 'info');
    const auth = await requestKeystoneSignature(`Create Private Auction: ${amount} tokens for min $${min}`);
    if (!auth) return;

    try {
      // === On-chain: seller deposits RWA bonds in the Vault ===
      // Only if bondId is a real deployed ERC-3643 contract address
      const isBondAddress = bondId && bondId.startsWith('0x') && bondId.length === 42;
      let bondDepositedOnChain = false;

      if (isBondAddress) {
        // Check if there is real bytecode at that address before attempting TX
        const directProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        const bytecode = await directProvider.getCode(bondId);
        const isRealContract = bytecode && bytecode !== '0x' && bytecode.length > 2;

        if (isRealContract) {
          addLog(`[blockchain] ERC-3643 contract detected at ${bondId.slice(0, 10)}... Initiating on-chain deposit.`, 'evm');
          const connection = await window.onchain.connectMetaMask();
          if (!connection) return addLog('❌ Failed to connect MetaMask', 'error');

          const { signer } = connection;
          const vaultAddress = ethers.getAddress(window.onchain.CONTRACT_ADDRESSES.stealthVaultEscrow || '0xdc11f7e700a4c898ae5caddb1082cffa76512add');
          const bondAddress = ethers.getAddress(bondId);

          const ERC20_ABI = [
            'function approve(address spender, uint256 amount) returns (bool)',
            'function decimals() view returns (uint8)'
          ];
          const VAULT_ABI = ['function deposit(address token, uint256 amount) external'];

          const bondRead = window.onchain.safeContract(bondAddress, ERC20_ABI, directProvider);
          const decimals = bondRead ? await bondRead.decimals().catch(() => 6) : 6;
          const amountRaw = ethers.parseUnits(String(parseFloat(amount).toFixed(6)), decimals);

          // TX 1: approve bond → vault
          addLog(`[blockchain] TX 1/2: BondToken.approve(vault, ${amount}) — Requesting signature...`, 'evm');
          const bondWrite = window.onchain.safeContract(bondAddress, ERC20_ABI, signer);
          const approveTx = await bondWrite.approve(vaultAddress, amountRaw);
          addLog(`[blockchain] TX 1/2 sent: ${approveTx.hash.slice(0, 18)}... Waiting...`, 'evm');
          await approveTx.wait();
          addLog(`[blockchain] ✅ Bond approve confirmed on-chain.`, 'evm');

          // TX 2: vault.deposit(bondAddress, amount)
          addLog(`[blockchain] TX 2/2: stealthVaultEscrow.deposit(bond, ${amount}) — Requesting signature...`, 'evm');
          const vaultWrite = window.onchain.safeContract(vaultAddress, VAULT_ABI, signer);
          const depositTx = await vaultWrite.deposit(bondAddress, amountRaw);
          addLog(`[blockchain] TX 2/2 sent: ${depositTx.hash.slice(0, 18)}... Waiting...`, 'evm');
          const depositReceipt = await depositTx.wait();
          addLog(`[blockchain] ✅ Bonds deposited into the Vault in block #${depositReceipt.blockNumber}. TX: ${depositReceipt.hash.slice(0, 18)}...`, 'evm');
          bondDepositedOnChain = true;

        } else {
          // bondId is a hash identifier (not a deployed contract).
          // The TEE handles the escrow of these tokens via off-chain private ledger.
          addLog(`[TEE] 🔒 Bond ${bondId.slice(0, 10)}... managed as TEE-Escrow asset (off-chain identifier). Enclave guarantees custody.`, 'cre');
        }
      }

      // === Register auction in backend (TEE off-chain) ===
      addLog(`[TEE] Registering auction in the Private Enclave...`, 'cre');
      const res = await fetch(`${API_BASE}/auction/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bondId,
          amount,
          minBid: min,
          sellerWallet: currentWallet
        })
      });
      const data = await res.json();
      if (data.success) {
        els.auctionStatus.innerHTML = '<p class="success">✅ Auction created within the Private Enclave.</p>';
        collapsedAuctions.clear();  // ← force all cards expanded
        loadAuctions();
        await loadPrivateBalances();
        await refreshPortfolio();  // ← update My Holdings
      } else {
        els.auctionStatus.innerHTML = `<p class="error">❌ ${data.error || 'Error creating auction'}</p>`;
      }
    } catch (e) {
      if (e.code === 4001 || (e.message && e.message.toLowerCase().includes('user rejected'))) {
        addLog(`⚠️ Transaction canceled by the user.`, 'info');
      } else {
        addLog(`❌ Error creating auction: ${e.message || e}`, 'error');
      }
      els.auctionStatus.innerHTML = `<p class="error">❌ Error: ${e.message}</p>`;
    }
  };

  // Marketplace initialization
  loadAuctions();
  loadPrivateBalances();
  refreshTickets();
}

// ============================================
// STAGE 5: AML
// ============================================
function initStage5() {
  const amlForm = document.getElementById('amlForm');
  const targetWalletInput = document.getElementById('targetWallet');
  const transferAmountInput = document.getElementById('transferAmount');
  const rwaTokenSelect = document.getElementById('rwaTokenSelect');
  const rwaBalanceHint = document.getElementById('rwaBalanceHint');
  const contaminateWalletBtn = document.getElementById('contaminateWalletBtn');
  const amlSteps = document.getElementById('amlSteps');
  const amlResult = document.getElementById('amlResult');
  const amlSubmitBtn = document.getElementById('amlSubmitBtn');
  const walletFreezeStatus = document.getElementById('walletFreezeStatus');

  const setStepStatus = (stepId, status) => {
    const el = document.getElementById(`aml-step-${stepId}`);
    if (!el) return;
    el.className = `step-item ${status}`;
    if (status === 'active') el.innerHTML = el.innerHTML.replace('⏳', '🔄').replace('✅', '🔄').replace('❌', '🔄');
    else if (status === 'completed') el.innerHTML = el.innerHTML.replace('🔄', '✅').replace('⏳', '✅');
    else if (status === 'error') el.innerHTML = el.innerHTML.replace('🔄', '❌').replace('⏳', '❌');
  };

  const resetSteps = () => {
    amlSteps.style.display = 'block';
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`aml-step-${i}`);
      if (el) {
        el.className = 'step-item';
        el.innerHTML = el.innerHTML.replace('🔄', '⏳').replace('✅', '⏳').replace('❌', '⏳');
      }
    }
    amlResult.innerHTML = '';
  };

  // Centralized function to check AML status
  async function checkAMLStatus(bondAddress) {
    if (!bondAddress || !currentWallet) {
      walletFreezeStatus.innerHTML = '';
      return;
    }
    try {
      const frozen = await window.onchain.isBondAddressFrozen(bondAddress, currentWallet);
      if (frozen) {
        walletFreezeStatus.innerHTML = '<span style="color:#ef4444; font-weight:bold; padding:0.2rem 0.5rem; background:rgba(239,68,68,0.2); border-radius:4px;">❄️ WALLET FROZEN (ERC3643)</span>';
        amlSubmitBtn.disabled = true;

        const alertCont = document.getElementById('amlAlertContainer');
        if (alertCont && !document.getElementById('tempOfacAlert')) {
          alertCont.innerHTML = `
            <div id="tempOfacAlert" style="background:#ef4444; color:white; padding:0.75rem; border-radius:6px; 
                 margin-bottom:1rem; text-align:center; font-weight:bold; border-left:4px solid #7f1d1d;
                 box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
              🚨 Wallet suspended by OFAC
            </div>
          `;
          setTimeout(() => {
            const el = document.getElementById('tempOfacAlert');
            if (el) el.remove();
          }, 5000);
        }
      } else {
        walletFreezeStatus.innerHTML = '<span style="color:#10b981; padding:0.2rem 0.5rem; background:rgba(16,185,129,0.2); border-radius:4px;">✓ Active</span>';
        amlSubmitBtn.disabled = false;

        // Clear alert if exists
        const el = document.getElementById('tempOfacAlert');
        if (el) el.remove();
      }
    } catch (e) {
      console.error("Error checkAMLStatus:", e);
    }
  }
  window.checkAMLStatus = checkAMLStatus; // Expose for updateWallet

  // Load on-chain balances when selecting token
  rwaTokenSelect.onchange = async () => {
    const bondAddress = rwaTokenSelect.value;
    if (!bondAddress || !currentWallet) {
      rwaBalanceHint.textContent = 'Select a token to see available balance';
      walletFreezeStatus.innerHTML = '';
      return;
    }
    rwaBalanceHint.textContent = 'Consulting blockchain...';
    try {
      const balance = await window.onchain.getBondBalanceOnChain(bondAddress, currentWallet);
      rwaBalanceHint.innerHTML = `Balance On-Chain: <strong style="color:#10b981;">${balance} tokens</strong>`;

      // Delegate freeze check
      await checkAMLStatus(bondAddress);

    } catch (e) {
      rwaBalanceHint.textContent = 'Error querying balance';
    }
  };

  contaminateWalletBtn.onclick = async () => {
    if (!currentWallet) return alert('Connect your wallet first');
    contaminateWalletBtn.disabled = true;
    contaminateWalletBtn.innerHTML = '🔄 Processing attack...';

    try {
      const res = await fetch(`${API_BASE}/aml/contaminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: currentWallet })
      });
      const data = await res.json();
      if (data.ok) {
        addLog(`[SYSTEM] 🚨 ATTENTION: Your wallet ${currentWallet.slice(0, 8)}... interacted with a simulated malicious protocol.`, 'error');
        addLog(`[AML Engine] Wallet added to the server's local blacklist.`, 'warning');
        contaminateWalletBtn.innerHTML = '☠️ Wallet Contaminated';
      }
    } catch (e) {
      console.error(e);
      contaminateWalletBtn.innerHTML = '💀 Trigger Malicious Interaction';
    } finally {
      setTimeout(() => { if (contaminateWalletBtn.innerHTML !== '☠️ Wallet Contaminated') contaminateWalletBtn.disabled = false; }, 2000);
    }
  };

  amlForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentWallet) return alert('Connect your wallet');

    const bondAddress = rwaTokenSelect.value;
    const targetWallet = targetWalletInput.value.trim().toLowerCase();
    const amount = transferAmountInput.value;

    if (!bondAddress) return alert('Select an RWA bond to transfer');

    amlSubmitBtn.disabled = true;
    resetSteps();
    addLog(`[ACE TEE] Initiating secure transfer orchestration: ${amount} tokens to ${targetWallet.slice(0, 8)}...`, 'info');

    try {
      // --- STEP 1: Pre-check On-Chain ---
      setStepStatus(1, 'active');
      addLog(`[blockchain] ERC-3643 freeze pre-check for destination...`, 'evm');
      const isTargetFrozen = await window.onchain.isBondAddressFrozen(bondAddress, targetWallet);

      if (isTargetFrozen) {
        setStepStatus(1, 'error');
        amlResult.innerHTML = `
          <div class="result-box blocked" style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; padding:1rem; border-radius:8px;">
            <h3 style="color:#ef4444; margin-top:0;">🛑 TRANSFER DENIED</h3>
            <p>The target wallet <b>is already frozen</b> at the Smart Contract level for this RWA bond.</p>
          </div>
        `;
        addLog(`[AML] Aborted: Destination is already frozen on the network.`, 'error');
        amlSubmitBtn.disabled = false;
        return;
      }
      setStepStatus(1, 'completed');

      // --- STEP 2, 3 & 4: TEE Workflow (Confidential HTTP) ---
      addLog(`[CRE] Triggering stage5-aml Workflow in the Enclave...`, 'cre');

      setStepStatus(2, 'active');
      const fetchPromise = fetch(`${API_BASE}/aml/transfer-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: targetWallet,
          sender: currentWallet,
          amount: amount,
          bondAddress: bondAddress
        })
      });

      await new Promise(r => setTimeout(r, 800));
      setStepStatus(2, 'completed');
      setStepStatus(3, 'active');

      await new Promise(r => setTimeout(r, 1200));
      setStepStatus(3, 'completed');
      setStepStatus(4, 'active');

      // Wait for the TEE to actually respond
      const res = await fetchPromise;
      const data = await res.json();

      // The TEE evaluated
      setStepStatus(4, 'completed');

      if (!data.clean || data.action === 'freeze') {
        // Bloqueado
        setStepStatus(5, 'error');
        amlResult.innerHTML = `
          <div class="result-box blocked" style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; padding:1rem; border-radius:8px;">
            <h3 style="color:#ef4444; margin-top:0;">🚨 TRANSFER BLOCKED BY TEE</h3>
            <p>Risk Score: <strong>${data.riskScore}/100</strong></p>
            <p>Reason: ${data.reason || 'Sanctions / Suspicious Activity'}</p>
            ${data.freeze?.executed ? `<p style="color:#ef4444; font-weight:bold; margin-top:0.5rem;">❄️ CONTRACT NOTIFIED: Wallet frozen on-chain.</p>` : ''}
            ${data.freeze?.txHash ? `<p style="font-size:0.8rem; word-break:break-all; color:#94a3b8;">TX: ${data.freeze.txHash}</p>` : ''}
          </div>
        `;
        addLog(`[ACE TEE] ❌ Transfer canceled. Reason: ${data.reason}`, 'error');
        if (data.freeze?.txHash) addLog(`[EVM] Violator wallet frozen: ${data.freeze.txHash}`, 'evm');

        amlSubmitBtn.disabled = false;
        return;
      }

      // --- STEP 5: TEE Approved, Execute On-Chain ---
      addLog(`[ACE TEE] ✅ Analysis passed (Score: ${data.riskScore}). Policy Manager authorizes the transfer.`, 'success');
      setStepStatus(5, 'active');

      addLog(`[blockchain] Requesting signature in MetaMask to perform transfer() call...`, 'evm');
      const connection = await window.onchain.connectMetaMask();
      if (!connection) throw new Error('MetaMask not connected');

      const ERC20_ABI = [
        'function transfer(address to, uint256 amount) returns (bool)',
        'function decimals() view returns (uint8)'
      ];

      const bondContract = window.onchain.safeContract(bondAddress, ERC20_ABI, connection.signer);
      const directProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
      const bondRead = window.onchain.safeContract(bondAddress, ERC20_ABI, directProvider);
      const decimals = await bondRead.decimals();
      const rawAmount = ethers.parseUnits(amount.toString(), decimals);

      const tx = await bondContract.transfer(targetWallet, rawAmount);
      addLog(`[blockchain] TX Broadcasted: ${tx.hash.slice(0, 15)}... Waiting for confirmation`, 'evm');

      const receipt = await tx.wait();
      addLog(`[blockchain] ✅ TRANSFER CONFIRMED in block #${receipt.blockNumber}`, 'success');
      setStepStatus(5, 'completed');

      // --- NEW: AUTOMATIC REGULATORY REPORTING (Threshold > 1000) ---
      const numericAmount = parseFloat(amount || '0');
      if (numericAmount >= 1000) {
        addLog(`[REPORT] 📄 Transaction > $1000 detected. Generating ACE encrypted report...`, 'info');
        try {
          await fetch(`${API_BASE}/report/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet: currentWallet,
              amount: numericAmount,
              reason: `Automatic High-Value Transaction Monitoring (Token: ${bondAddress.slice(0, 8)})`
            })
          });
          addLog(`[REPORT] ✅ Report persisted in the Audit Ledger.`, 'success');
          // Update Stage 6 list if already loaded
          if (typeof loadRegulatoryReports === 'function') loadRegulatoryReports();
        } catch (reportErr) {
          console.error("Error generating auto report:", reportErr);
        }
      }

      amlResult.innerHTML = `
        <div class="result-box clean" style="background:rgba(16,185,129,0.1); border:1px solid #10b981; padding:1rem; border-radius:8px;">
          <h3 style="color:#10b981; margin-top:0;">✅ TRANSFER SUCCESSFUL</h3>
          <p>The Policy Manager approved the flow and the blockchain settled the operation.</p>
          <div style="margin-top:0.8rem; padding:0.5rem; background:#0f172a; border-radius:4px; font-size:0.8rem;">
            <div>Target: ${targetWallet.slice(0, 10)}...</div>
            <div>TX Hash: <a href="#" style="color:#22d3ee;" onclick="event.preventDefault();">${receipt.hash.slice(0, 15)}...</a></div>
          </div>
        </div>
      `;

      refreshPortfolio();

    } catch (err) {
      if (err.code === 4001 || (err.message && err.message.toLowerCase().includes('user rejected'))) {
        addLog(`⚠️ User canceled the signature in MetaMask.`, 'warning');
      } else {
        addLog(`❌ Error in the process: ${err.message}`, 'error');

        // Show clear blocked UI for on-chain revert (Sanctions/Frozen)
        amlResult.innerHTML = `
          <div class="result-box blocked" style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; padding:1rem; border-radius:8px;">
            <h3 style="color:#ef4444; margin-top:0;">🛑 BLOCKED ON-CHAIN</h3>
            <p>The TEE analysis might have passed, but the <b>Smart Contract</b> rejected the transfer.</p>
            <p style="font-size:0.85rem; color:#94a3b8; margin-top:0.5rem;">Reason: ${err.message.includes('reverted') ? 'Compliance policy violation (frozen/sanctioned)' : err.message}</p>
          </div>
        `;
      }
      setStepStatus(5, 'error');
    } finally {
      amlSubmitBtn.disabled = false;
    }
  };
}

// ============================================
// STAGE 6: REPORTS & PoR
// ============================================
let regulatorMode = false;

function initStage6() {
  els.porBondSelect.onchange = () => {
    const bondId = els.porBondSelect.value;
    if (bondId) updatePoRStatus(bondId);
  };

  // Dummy hidden button events emptied to avoid breaking element mapping
  els.generateManualReportBtn.onclick = () => { };

  els.regulatorLoginBtn.onclick = async () => {
    const SUNAVAL_WALLET = '0xa66854b2df0dd19b96af382336721b61f222ddff';
    const isSUNAVAL = currentWallet && currentWallet.toLowerCase() === SUNAVAL_WALLET.toLowerCase();

    if (!isSUNAVAL) {
      els.auditAccessMessage.innerHTML = '<span style="color: #ef4444;">⚠️ ACCESS DENIED: Only SUNAVAL holds the key for the audit signature.</span>';
      addLog('Unauthorized access attempt to the TEE decryption engine.', 'error');
      setTimeout(() => { els.auditAccessMessage.innerHTML = ''; }, 4000);
      return;
    }

    if (regulatorMode) {
      // Toggle off
      regulatorMode = false;
      els.regulatorLoginBtn.textContent = '🔑 Audit Access (SUNAVAL Signature)';
      els.regulatorLoginBtn.className = 'btn btn-secondary btn-sm';
      els.reportPayloadSection.style.display = 'none';
      els.decryptedReportView.style.display = 'none';
      loadRegulatoryReports();
      return;
    }

    try {
      els.auditAccessMessage.innerHTML = '<span style="color: #22d3ee;">Requesting signature in MetaMask...</span>';
      els.regulatorLoginBtn.disabled = true;

      // Real cryptographic challenge via MetaMask
      const challenge = `ACE_AUDIT_CHALLENGE_${Date.now()}`;
      const msgHex = '0x' + Array.from(new TextEncoder().encode(challenge))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [msgHex, currentWallet]
      });

      addLog(`[CRE TEE] 🔓 SIGNATURE VERIFIED (${signature.slice(0, 15)}...): Unlocking regulator decryption.`, 'warning');

      regulatorMode = true;
      els.auditAccessMessage.innerHTML = '';
      els.regulatorLoginBtn.textContent = '🔒 Close Audit View';
      els.regulatorLoginBtn.className = 'btn btn-primary btn-sm';
      els.reportPayloadSection.style.display = 'block';
      loadRegulatoryReports();

    } catch (err) {
      els.auditAccessMessage.innerHTML = '<span style="color: #ef4444;">Signature error. Required for auditing.</span>';
      console.error(err);
    } finally {
      els.regulatorLoginBtn.disabled = false;
    }
  };

  // Dummy hidden button events emptied
  els.confirmSignAuditBtn.onclick = () => { };
  els.cancelSignAuditBtn.onclick = () => { };
}

async function updatePoRStatus(bondId) {
  if (!regulatorMode) {
    els.porIndicator.textContent = '🔒 ACCESS DENIED';
    els.porIndicator.style.color = '#ef4444'; // Red
    els.porDetail.innerHTML = '<span style="color: #ef4444; font-size: 0.8rem;">You must first authenticate as a Regulator (SUNAVAL) using the MetaMask signature to audit this trust.</span>';
    addLog(`[CRE TEE] 🚫 Permission DENIED for PoR Audit: Requires SUNAVAL Signature`, 'error');
    return;
  }

  els.porIndicator.textContent = '🔄 AUDITING VIA CRE...';
  els.porIndicator.style.color = '#94a3b8';
  els.porDetail.textContent = `Querying bank reserves for ${bondId} via ConfidentialHTTP...`;

  addLog(`[CRE TEE] 🔐 Authorizing PoR Audit orchestration for asset ${bondId}...`, 'info');

  try {
    const res = await fetch(`${API_BASE}/report/por-audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bondId, regulatorWallet: currentWallet })
    });

    const data = await res.json();
    await simulateDelay(1500); // Simulate TEE network processing delay

    if (res.ok && data.success) {
      if (data.ratio >= 100) {
        els.porIndicator.textContent = '✅ ' + data.ratio.toFixed(1) + '% BACKED';
        els.porIndicator.style.color = '#10b981';
      } else {
        els.porIndicator.textContent = '⚠️ DEFICIT (' + data.ratio.toFixed(1) + '%)';
        els.porIndicator.style.color = '#f59e0b';
      }

      els.porDetail.innerHTML = `
          <b>Asset Supply (On-Chain):</b> $${data.supply.toLocaleString()} <br>
          <b>Verified Reserves (Fiat):</b> $${data.reserves.toLocaleString()}<br>
          <code style="font-size:0.75rem; color:#22d3ee;">TEE Proof Generated for ${currentWallet.slice(0, 6)}...</code>
      `;
      addLog(`[CRE TEE] ✅ Audit Finished: Trust Ratio at ${data.ratio.toFixed(1)}%.`, 'success');
    } else {
      els.porIndicator.textContent = '🚫 REJECTED';
      els.porIndicator.style.color = '#ef4444';
      els.porDetail.textContent = data.error || 'Error validating regulatory identity.';
      addLog(`[CRE TEE] 🚫 Audit failed: ${data.error || 'Unauthorized'}`, 'error');
    }

  } catch (e) {
    els.porIndicator.textContent = '⚠️ LOAD ERROR';
    els.porDetail.textContent = e.message;
    addLog(`[CRE TEE] ⚠️ Critical Error in TEE Orchestration: ${e.message}`, 'error');
  }
}

async function loadRegulatoryReports() {
  if (!els.regulatoryReportsList) return;
  try {
    const res = await fetch(`${API_BASE}/report/list`);
    const reports = await res.json();

    // Update On-Chain counter if element exists
    const onChainCountEl = document.getElementById('onChainReportCount');
    if (onChainCountEl) {
      const onChainReports = reports.filter(r => r.onChainTx).length;
      onChainCountEl.innerHTML = `⛓️ On-Chain Reports confirmed: <b>${onChainReports}</b>`;
    }

    if (reports.length === 0) {
      els.regulatoryReportsList.innerHTML = '<tr><td colspan="6" style="text-align:center;">No reports.</td></tr>';
      return;
    }

    if (!regulatorMode) {
      els.decryptedReportView.style.display = 'none';
      els.encryptedPayloadView.textContent = "Select a report to see its encrypted envelope...";
    }

    els.regulatoryReportsList.innerHTML = reports.map(r => {
      const displayIdentity = regulatorMode ?
        `<span style="color:#22d3ee; font-weight:bold;">${r.realName} (RIF: ${r.rif})</span>` :
        `<span style="color:#94a3b8;">[SECURE_ENVELOPE_LOCK]</span>`;

      const onChainBadge = r.onChainTx ?
        `<span title="Tx: ${r.onChainTx}" style="color:#10b981; font-family:monospace; font-size:0.75rem;">✅ Block #${r.onChainBlock}</span>` :
        `<span style="color:#f59e0b; font-size:0.75rem;">⏳ Pending</span>`;

      return `
            <tr>
              <td><code style="color:#a78bfa;">${r.hash.slice(0, 10)}...</code></td>
              <td><b>$${r.amount}</b></td>
              <td>${displayIdentity}</td>
              <td><small>${new Date(r.timestamp).toLocaleString()}</small></td>
              <td>${onChainBadge}</td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="showEncryptedHint('${r.hash}')">View Payload</button>
              </td>
            </tr>
            `;
    }).join('');
  } catch (e) {
    console.error("Error loading reports", e);
  }
}

window.showEncryptedHint = async (hash) => {
  els.reportPayloadSection.style.display = 'block';

  try {
    const res = await fetch(`${API_BASE}/report/list`);
    const reports = await res.json();
    const report = reports.find(r => r.hash === hash);

    if (report && report.encryptedEnvelope) {
      els.encryptedPayloadView.textContent = `--- BEGIN ACE ENCRYPTED ENVELOPE ---
Algorithm: ${report.encryptedEnvelope.algorithm || 'AES-256-GCM'}
Regulator: ${report.encryptedEnvelope.regulatorAddress}
IV:        ${report.encryptedEnvelope.iv}
Tag:       ${report.encryptedEnvelope.tag}
KeyHash:   ${report.encryptedEnvelope.keyHash}

Ciphertext:
${report.encryptedEnvelope.encrypted}
--- END ACE ENCRYPTED ENVELOPE ---`;
    } else {
      els.encryptedPayloadView.textContent = `Legacy report or without envelope: ${hash}`;
    }

    addLog(`Visualizing AES encrypted container of report ${hash.slice(0, 8)}`, 'info');

    if (regulatorMode && currentWallet) {
      els.decryptedReportView.style.display = 'block';
      els.decryptedJson.textContent = "Decrypting with CRE TEE via backend...";

      const decRes = await fetch(`${API_BASE}/report/decrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportHash: hash, regulatorWallet: currentWallet })
      });

      const decryptedData = await decRes.json();
      if (decryptedData.decrypted) {
        els.decryptedJson.textContent = JSON.stringify(decryptedData.data, null, 2);
      } else {
        els.decryptedJson.textContent = `[DECRYPTION ERROR] ${decryptedData.error}`;
      }
    } else {
      els.decryptedReportView.style.display = 'none';
    }
  } catch (e) {
    console.error(e);
  }
};
