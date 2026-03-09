// Bond issuance and reserve monitoring
const { saveState } = require('../utils/stateManager');

module.exports = (state, log) => ({
  // POST /bond/issue (Fallback/Manual)
  issueHandler(req, res) {
    const { name, amount, chain, issuer } = req.body;
    if (!name || !amount || !chain || !issuer) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const bondId = 'BOND_' + Date.now();
    const newBond = {
      bondId,
      id: bondId,
      address: bondId,
      name,
      nominalValue: parseFloat(amount),
      reserveRatio: 100,
      chain,
      issuer,
      status: 'ACTIVE',
      paused: false,
      createdAt: new Date().toISOString()
    };
    if (!Array.isArray(state.bonds)) state.bonds = [];
    state.bonds.push(newBond);
    saveState(state);
    log('BOND', `Issued ${bondId} (${amount} USD) on ${chain} by ${issuer}`);
    res.json(newBond);
  },

  listHandler(req, res) {
    const rawBonds = Array.isArray(state.bonds) ? state.bonds : Object.values(state.bonds || {});
    const bonds = rawBonds.map(b => ({
      ...b,
      id: b.id || b.address || b.bondId,
      address: b.address || b.bondId || b.id
    }));
    res.json(bonds);
  },

  // POST /monitor/run (Simulated Monitor)
  async monitorHandler(req, res) {
    const rawBonds = Array.isArray(state.bonds) ? state.bonds : Object.values(state.bonds || {});
    if (rawBonds.length === 0) {
      return res.json({ healthy: true, reserves: 0, totalSupply: 0, reserveRatio: 0 });
    }
    const bond = rawBonds[0];
    const totalSupply = bond.nominalValue || bond.totalSupply || 10000;

    // Simulation: reserves between 95% and 100%
    const mockReserves = Math.floor(totalSupply * (0.95 + Math.random() * 0.05));
    const healthy = mockReserves >= totalSupply;

    if (!healthy && bond.status !== 'PAUSED') {
      bond.status = 'PAUSED';
      log('MONITOR', `⚠️ ${bond.bondId || bond.id} paused due to insufficient reserves (${mockReserves}/${totalSupply})`);
    } else if (healthy && bond.status === 'PAUSED') {
      bond.status = 'ACTIVE';
      log('MONITOR', `✅ ${bond.bondId || bond.id} resumed (reserves OK)`);
    }
    bond.reserveRatio = Math.floor((mockReserves / totalSupply) * 100);
    saveState(state);
    res.json({
      healthy,
      reserves: mockReserves,
      totalSupply: totalSupply,
      reserveRatio: bond.reserveRatio,
      status: bond.status
    });
  }
});
