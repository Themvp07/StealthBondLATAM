const logger = require('../utils/logger');
const onchain = require('../utils/onchain');

module.exports = (state, broadcast) => {
    // Initialize reserves in state if they don't exist
    if (!state.bankReserves) {
        state.bankReserves = {};
    }
    // Initialize reserve entries for each real bond registered in state.bonds
    // This ensures newly issued bonds (Bond2, Bond3, etc.) have their collateral
    if (Array.isArray(state.bonds)) {
        state.bonds.forEach(bond => {
            const collId = bond.collateralId;
            if (collId && !state.bankReserves[collId]) {
                state.bankReserves[collId] = {
                    amount: bond.collateralValue || bond.nominalValue || 0,
                    currency: 'USD',
                    owner: bond.owner || 'COMPANY'
                };
            }
        });
    }

    return {
        reservesHandler: (req, res) => {
            const { collateralId } = req.params;
            const reserve = state.bankReserves[collateralId];

            broadcast('SYSTEM', `🛡️ [BANK] Collateral verification request: ${collateralId}`);

            if (!reserve) {
                return res.status(404).json({ error: 'Collateral not found' });
            }

            res.json(reserve);
        },

        updateReservesHandler: (req, res) => {
            const { collateralId, newAmount } = req.body;

            // If it doesn't exist, we initialize it dynamically to avoid the 0.00% error
            if (!state.bankReserves[collateralId]) {
                state.bankReserves[collateralId] = {
                    amount: 0,
                    currency: "USD",
                    owner: "SYSTEM_DYNAMIC"
                };
            }

            state.bankReserves[collateralId].amount = Number(newAmount);

            // Synchronize with the global Bonds Array so Stage 6 PoR and Custodian reflect it
            if (Array.isArray(state.bonds)) {
                const bondToUpdate = state.bonds.find(b => b.name === collateralId || b.bondId === collateralId || b.ticker === collateralId || b.id === collateralId);
                if (bondToUpdate) {
                    bondToUpdate.collateralValue = Number(newAmount);
                }
            }

            saveState(state);
            broadcast('SYSTEM', `⚠️ [BANK] Reserves updated for ${collateralId}: $${newAmount}`);
            return res.json({ success: true, newAmount: state.bankReserves[collateralId].amount });
        },

        getFiatBalanceHandler: async (req, res) => {
            const { wallet } = req.params;
            const addr = wallet.toLowerCase();

            // 1. Get simulated balance (VES, EURC)
            let balance = { USDC: 0, VES: 0, EURC: 0 };
            if (state.fiatBalances) {
                const key = Object.keys(state.fiatBalances).find(k => k.toLowerCase() === addr);
                if (key) balance = { ...state.fiatBalances[key] };
            }

            // 2. Get ACTUAL on-chain USDC balance
            try {
                const onChainUsdc = await onchain.getUSDCBalance(addr);
                balance.USDC = onChainUsdc; // Overwrite with actual
                broadcast('SYSTEM', `🏧 [BANK] Actual USDC balance for ${addr.slice(0, 8)}: ${onChainUsdc}`);
            } catch (err) {
                console.warn("On-chain USDC read failure", err);
            }

            res.json(balance);
        }
    };
};

const { saveState } = require('../utils/stateManager');
