// Custodian Bank Simulation (For Proof of Reserve and Collateral Validation)

module.exports = (state, log) => ({
    async validateCollateralHandler(req, res) {
        const { issuerWallet, requestedAmount, assetName } = req.body;

        log('CUSTODIAN', `🔍 [Mock Central Bank] TEE requesting collateral validation for: ${assetName} for $${requestedAmount}`);

        if (requestedAmount > 10000000) {
            log('CUSTODIAN', `❌ Rejected: Insufficient collateral in custodial account.`);
            return res.json({ approved: false, reason: "Insufficient liquidity in FIAT reserves" });
        }

        log('CUSTODIAN', `✅ Approved: Collateral exists. Issuing Proof of Reserve ID.`);

        return res.json({
            approved: true,
            receiptId: `PORK-` + Math.random().toString(36).substr(2, 9).toUpperCase(),
            currentReserveRatio: 10000 // 100%
        });
    },

    async getCollateralHandler(req, res) {
        const bondId = req.params.bondId;
        // Robust lookup: Prioritize Name or bondId (unique identifiers) over Address (which might be duplicated in state)
        let bondState = state.bonds.find(b => b.name === bondId || b.bondId?.toString() === bondId?.toString());

        if (!bondState) {
            bondState = state.bonds.find(b =>
                b.ticker === bondId ||
                (b.address && b.address.toLowerCase() === bondId.toLowerCase())
            );
        }

        let nominal = 10000;
        let collateral = 10000;
        let bondName = bondId;

        if (bondState) {
            nominal = bondState.nominalValue || bondState.amount || 10000;
            // Align to 1.5x overcollateralization from Stage 2 metadata
            collateral = bondState.collateralValue !== undefined ? bondState.collateralValue : nominal * 1.5;
            bondName = bondState.name || bondId;
        } else {
            // Fallback mapping to state.bankReserves just in case
            if (state.bankReserves && state.bankReserves[bondId]) {
                collateral = state.bankReserves[bondId].amount || 15000;
                nominal = collateral / 1.5;
            }
        }

        log('CUSTODIAN', `🔍 [Mock Trust] TEE querying balance for: ${bondName}. Value in custody: $${collateral}`);

        return res.json({
            bondId: bondId,
            bondName: bondName,
            collateralValueUsd: collateral,
            nominalValueUsd: nominal,
            currency: "USD",
            status: collateral >= nominal ? "healthy" : "deficit",
            lastAudit: new Date().toISOString()
        });
    },

    async simulateHackHandler(req, res) {
        const { bondId, newCollateralValue } = req.body;

        let bondState = state.bonds.find(b => b.name === bondId || b.bondId === bondId || b.ticker === bondId);

        if (!bondState) {
            bondState = { name: bondId, bondId: bondId, nominalValue: 10000 };
            state.bonds.push(bondState);
        }

        bondState.collateralValue = Number(newCollateralValue);

        const { saveState } = require('../utils/stateManager');
        saveState(state);

        log('CUSTODIAN', `🚨 [SIMULATION] PANIC! Trust value for bond ${bondId} has fallen to $${newCollateralValue}.`);

        return res.json({
            success: true,
            message: "Hacked: Collateral successfully modified",
            collateralValueUsd: newCollateralValue,
            bondId: bondId
        });
    }
});
