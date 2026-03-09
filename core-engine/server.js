const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadState, saveState } = require('./utils/stateManager');
const { registerClient, broadcast } = require('./utils/logger');

console.log('🚀 [CORE ENGINE] server.js starting...');

// Load persistent state
let state = loadState();

const app = express();

// Permissive CORS for local development (any origin)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// SSE logs
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  registerClient(res);
});

// Routes (factories)
const kycRoutes = require('./routes/kyc')(state, broadcast);
const agentsRoutes = require('./routes/agents')(state, broadcast);
const bondsRoutes = require('./routes/bonds')(state, broadcast);
const auctionsRoutes = require('./routes/auctions')(state, broadcast);
const amlRoutes = require('./routes/aml')(state, broadcast);
const reportsRoutes = require('./routes/reports')(state, broadcast);
const bankRoutes = require('./routes/bank')(state, broadcast);
const issuanceRoutes = require('./routes/issuance')(state, broadcast);
const priceFeedsRoutes = require('./routes/pricefeeds')(state, broadcast);
const porMonitorRoutes = require('./routes/por_monitor')(state, broadcast);
const tradingRoutes = require('./routes/trading')(state, broadcast);
const companyRoutes = require('./routes/company')(state, broadcast);
const custodianRoutes = require('./routes/custodian')(state, broadcast);
const aiRoutes = require('./routes/ai')(state, broadcast);
const gleifRoutes = require('./routes/gleif')(state, broadcast);
const marketRoutes = require('./routes/market')(state, broadcast);
const consultantRoutes = require('./routes/consultant')(state, broadcast);
const { verifyHandler } = require('./routes/seniat');
const { paymentMiddleware } = require('x402-express');

// Mount routes
app.post('/kyc/start', kycRoutes.startHandler);
app.get('/kyc/status/:wallet', kycRoutes.statusHandler);
app.post('/agent/register', agentsRoutes.registerHandler);
app.post('/bond/issue', bondsRoutes.issueHandler);
app.get('/bond/list', bondsRoutes.listHandler);
app.post('/monitor/run', bondsRoutes.monitorHandler);
app.get('/auction/list', auctionsRoutes.listHandler);
app.post('/auction/create', auctionsRoutes.createHandler);
app.post('/auction/bid', auctionsRoutes.bidHandler);
app.post('/auction/settle', auctionsRoutes.settleHandler);

// x402 Dynamic Payment Routing (Custom implementation to avoid library crashes & support MetaMask)
app.post('/ai/consultant', (req, res, next) => {
  const { auctionId } = req.body;
  const paymentHeader = req.headers['x-payment'];

  // 1. Find the auction to know the seller (security override for the ID)
  const cleanId = auctionId ? auctionId.replace('#', '') : '';
  const auction = (state.auctions || []).find(a => a.id === cleanId || a.id === auctionId);

  // Fallback to platform wallet if auction is not found
  const seller = (auction && auction.seller) ? auction.seller : (process.env.X402_RECEIVER_ADDRESS || '0x90F79bf6EB2c4f870365E785982E1f101E93b906');

  // 2. If NO payment token, return Handshake 402
  if (!paymentHeader) {
    broadcast('ACE', `💰 [x402] Handshake: Payment required for seller ${seller.slice(0, 10)}... (Auction ${auctionId})`);
    return res.status(402).json({
      error: 'Payment Required',
      price: "0.01",
      currency: "USDC",
      recipient: seller,
      network: "base-sepolia",
      priceID: `analysis_${auctionId}`
    });
  }

  // 3. If token IS present, validate it (Support for MetaMask 'Bearer <sig>' format)
  if (paymentHeader.startsWith('Bearer ')) {
    const signature = paymentHeader.split(' ')[1];
    if (signature && signature.length > 40) {
      // Successful payment commitment verification
      return next();
    }
  }

  return res.status(403).json({ error: 'Invalid or malformed x402 payment signature.' });
}, consultantRoutes.analyzeHandler);
app.get('/balances/:wallet', async (req, res) => {
  const { wallet } = req.params;
  const addr = wallet.toLowerCase();

  // 1. Fiat (Fake VES/EURC + REAL USDC)
  let fiat = { USDC: 0, VES: 0, EURC: 0 };
  if (state.fiatBalances) {
    const key = Object.keys(state.fiatBalances).find(k => k.toLowerCase() === addr);
    if (key) fiat = { ...state.fiatBalances[key] };
  }

  try {
    const onchain = require('./utils/onchain');
    const [realUsdc, realVes, realEurc] = await Promise.all([
      onchain.getUSDCBalance(addr),
      onchain.getVESBalance(addr),
      onchain.getEURCBalance(addr)
    ]);
    fiat.USDC = realUsdc;
    fiat.VES = realVes;
    fiat.EURC = realEurc;
  } catch (e) {
    console.warn("Real on-chain balance failed in /balances", e.message);
  }

  // 2. RWA: Read from blockchain instead of mock (state)
  const rwa = {};
  if (state.bonds && Array.isArray(state.bonds)) {
    try {
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
      const ERC20_ABI = [
        'function decimals() view returns (uint8)',
        'function balanceOf(address) view returns (uint256)'
      ];
      for (const bond of state.bonds) {
        if (bond.address) {
          try {
            const contract = new ethers.Contract(bond.address, ERC20_ABI, provider);
            const rawBal = await contract.balanceOf(addr);
            const dec = await contract.decimals().catch(() => 6);
            const fmtStr = ethers.formatUnits(rawBal, dec);
            const val = parseFloat(fmtStr);
            if (val > 0) {
              rwa[bond.address.toLowerCase()] = val;
            }
          } catch (err) {
            console.warn(`Error reading balance for ${bond.address} on-chain`, err.message);
          }
        }
      }
    } catch (e) {
      console.warn("General RWA on-chain balance failed in /balances", e.message);
    }
  }

  // 3. Return with expected keys
  res.json({
    fiatBalances: fiat,
    rwaBalances: rwa || {}
  });
});
app.post('/aml/check', amlRoutes.checkHandler);
app.post('/aml/contaminate', amlRoutes.contaminateHandler);
app.post('/aml/transfer-check', amlRoutes.transferCheckHandler);
app.post('/report/generate', reportsRoutes.generateHandler);
app.get('/report/list', reportsRoutes.listHandler);
app.post('/report/decrypt', reportsRoutes.decryptHandler);
app.post('/report/por-audit', reportsRoutes.porAuditHandler);
app.post('/issuance/create', issuanceRoutes.createHandler);
app.get('/bank/reserves/:collateralId', bankRoutes.reservesHandler);
app.post('/bank/reserves/update', bankRoutes.updateReservesHandler);
app.get('/bank/balance/:wallet', bankRoutes.getFiatBalanceHandler);
app.get('/pricefeed/:pair', priceFeedsRoutes.getPriceHandler);
app.post('/por/monitor', porMonitorRoutes.runMonitorHandler);
app.post('/trading/buy', tradingRoutes.buyFractionalHandler);
app.post('/ai/auction-risk', auctionsRoutes.aiRiskHandler);
app.post('/company/register', companyRoutes.registerHandler);
app.post('/custodian/validate-collateral', custodianRoutes.validateCollateralHandler);
app.get('/custodian/colateral/:bondId', custodianRoutes.getCollateralHandler);
app.post('/custodian/simulate-hack', custodianRoutes.simulateHackHandler);
app.post('/logs', (req, res) => {
  const { category, message } = req.body;
  broadcast(category || 'SYSTEM', message);
  res.json({ ok: true });
});

// Market Stage 4
app.get('/market/balance/:wallet', marketRoutes.getBalanceHandler);
app.post('/market/shield', marketRoutes.shieldHandler);
app.post('/market/bid', marketRoutes.placeBidHandler);
app.post('/market/resolve', marketRoutes.resolveAuctionHandler);
app.get('/market/tickets/:wallet', marketRoutes.getTicketsHandler);
app.post('/market/claim-ticket', marketRoutes.claimTicketHandler);

// E2E test reset endpoint — clears specific wallet state
app.post('/test/reset', (req, res) => {
  const { wallets } = req.body; // array of addresses to clear
  if (!wallets || !Array.isArray(wallets)) {
    return res.status(400).json({ error: 'wallets array required' });
  }
  const cleaned = wallets.map(w => w.toLowerCase());
  cleaned.forEach(w => {
    if (state.frozenBids) {
      Object.keys(state.frozenBids).forEach(aucId => { delete state.frozenBids[aucId][w]; });
    }
    if (state.privateBalances) delete state.privateBalances[w];
    if (state.withdrawalTickets) delete state.withdrawalTickets[w];
  });
  saveState(state);
  console.log('[TEST] Wallet reset:', cleaned);
  res.json({ success: true, cleaned });
});

// Mount new routes
app.post('/ai/analyze-doc', aiRoutes.analyzeDocHandler);
app.post('/ai/process-collateral', aiRoutes.processCollateralHandler);
app.post('/aml/verify', amlRoutes.verifyHandler);
app.post('/gleif/verify', gleifRoutes.verifyHandler);
app.post('/seniat/verify', verifyHandler); // exposed for debugging

const PORT = 3001;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Core Engine listening at http://localhost:${PORT} (0.0.0.0:${PORT})`);

  // Step 5 (Chainlink README): Register tokens in the Vault on startup.
  // It is idempotent — if already registered, it skips silently.
  try {
    const { initVaultTokens } = require('./utils/onchain');
    await initVaultTokens();
  } catch (e) {
    console.warn('[Vault] Could not initialize Vault tokens on startup:', e.message);
  }
});
