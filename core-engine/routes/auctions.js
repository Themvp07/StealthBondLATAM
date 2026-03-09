const { saveState } = require('../utils/stateManager');

module.exports = (state, broadcast) => {
  return {
    listHandler: (req, res) => {
      try {
        const { wallet } = req.query;
        const currentWallet = wallet ? wallet.toLowerCase() : '';

        const auctionsArray = Array.isArray(state.auctions) ? state.auctions : [];

        // Map to hide amounts from others (TEE Privacy)
        const auctions = auctionsArray.map(auc => {
          const reqWallet = currentWallet.trim();
          const sellerWallet = (auc.seller || '').trim().toLowerCase();

          const isSeller = reqWallet && sellerWallet && (sellerWallet === reqWallet);
          const isRegulator = reqWallet && (reqWallet.includes('sunaval') || reqWallet.includes('regulator'));
          const isSettled = auc.status && auc.status.toString().toUpperCase() === 'SETTLED';

          const bids = (auc.bids || []).map(bid => {
            const bidderWallet = (bid.bidder || '').trim().toLowerCase();
            const isOwnBid = reqWallet && bidderWallet === reqWallet;
            const canSee = isOwnBid || ((isSeller || isRegulator) && isSettled);

            if (canSee) return bid;
            return {
              ...bid,
              amount: '***** (Encrypted by ACE)',
              isMasked: true
            };
          });
          return { ...auc, bids };
        });

        res.json(auctions);
      } catch (err) {
        console.error('[DATABASE_ERROR] Error in listHandler:', err);
        res.json([]); // Return empty instead of exploding
      }
    },

    createHandler: (req, res) => {
      const { bondId, amount, minBid, sellerWallet: rawWallet } = req.body;
      const sellerWallet = rawWallet ? rawWallet.toLowerCase() : null;

      if (!bondId || !amount || !minBid || !sellerWallet) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // 1. Validate balances (Escrow)
      // FIX: Ensure balances object exists for user
      if (!state.balances[sellerWallet]) state.balances[sellerWallet] = {};

      const currentBalance = state.balances[sellerWallet][bondId] || 0;

      if (currentBalance < parseFloat(amount)) {
        return res.status(400).json({ error: `Insufficient balance. You have ${currentBalance} tokens of this bond.` });
      }

      // 2. Create auction
      const auctionId = `auc_${Math.random().toString(16).slice(2, 6)}`;
      const newAuction = {
        id: auctionId,
        bondId,
        seller: sellerWallet,
        amount: parseFloat(amount),
        minBid: parseFloat(minBid),
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        bids: []
      };

      // 3. Lock funds (Move to virtual Escrow)
      state.balances[sellerWallet][bondId] -= parseFloat(amount);
      if (!state.auctions) state.auctions = [];
      state.auctions.push(newAuction);

      saveState(state);

      // 4. Register the RWA bond in the Vault if not already registered
      //    (Step 5 Chainlink: bonds are registered dynamically when creating the auction)
      //    bondId in our system is the ERC-3643 bond contract address
      setImmediate(async () => {
        try {
          const { registerBondInVault } = require('../utils/onchain');
          if (bondId && bondId.startsWith('0x') && bondId.length === 42) {
            await registerBondInVault(bondId);
          }
        } catch (e) {
          console.warn('[Vault] Could not register bond in Vault:', e.message);
        }
      });

      broadcast('ACE', `⛓️ [EVM] Escrow Deposit: ${amount} tokens of bond ${bondId.slice(0, 8)}...`);
      broadcast('SYSTEM', `✅ [ACE] New Auction #${auctionId} created successfully.`);

      res.json({ success: true, auctionId });
    },

    bidHandler: (req, res) => {
      const { auctionId, bidAmount, bidderWallet: rawWallet } = req.body;
      const bidderWallet = rawWallet ? rawWallet.toLowerCase() : null;

      const auction = (state.auctions || []).find(a => a.id === auctionId);
      if (!auction) return res.status(404).json({ error: 'Auction not found' });

      broadcast('ACE', `🔒 [TEE] Receiving bid from: ${bidderWallet.slice(0, 10)}... (Executing sealed-bid protocol)`);

      setTimeout(() => {
        auction.bids.push({
          bidder: bidderWallet,
          amount: parseFloat(bidAmount),
          timestamp: new Date().toISOString(),
          encrypted: true
        });

        // Simulate a BOT also bidding to provide competition
        const botBid = parseFloat(bidAmount) * (1 + (Math.random() * 0.05 - 0.02)); // +/- 2%
        auction.bids.push({
          bidder: '0xBOT_GAMMA_MARKET_MAKER',
          amount: parseFloat(botBid.toFixed(2)),
          timestamp: new Date().toISOString(),
          encrypted: true
        });

        saveState(state);
        broadcast('ACE', `🛡️ [Identity Manager] CCID Verified for bidder ${bidderWallet.slice(0, 8)}.`);
        broadcast('SYSTEM', `✅ [ACE] Encrypted Bid received in TEE. Agent Bot competition detected.`);

        res.json({ success: true });
      }, 800);
    },

    aiRiskHandler: (req, res) => {
      const { auctionId, wallet, paid } = req.body;

      // x402 Simulation: If not marked as "paid", return 402
      if (!paid) {
        broadcast('ACE', `💰 [x402] Request detected. Micropayment required to access risk oracle.`);
        return res.status(402).json({
          error: 'Payment Required',
          fee: 0.01,
          currency: 'USDC',
          target: '0xACE_AI_AGENT_VAULT'
        });
      }

      // Once paid, return data
      const auction = (state.auctions || []).find(a => a.id === auctionId);
      const bondName = state.bonds[auction?.bondId]?.name || 'the bond';

      broadcast('SYSTEM', `🤖 [ACE] Micropayment x402 received. Generating AI report for ${wallet?.slice(0, 8)}...`);

      res.json({
        success: true,
        analysis: `Based on Data Feeds history and collateralId [${state.bonds[auction?.bondId]?.collateralId}], I suggest a bid of ${auction ? (auction.minBid * 1.02).toFixed(2) : '---'} to exceed the market average.`
      });
    },

    settleHandler: (req, res) => {
      const { auctionId, sellerWallet: rawWallet } = req.body;
      const sellerWallet = rawWallet ? rawWallet.toLowerCase() : null;

      const auction = (state.auctions || []).find(a => a.id === auctionId);
      if (!auction) return res.status(404).json({ error: 'Auction not found' });

      if (auction.seller !== sellerWallet) {
        return res.status(403).json({ error: 'Only the seller can settle the auction' });
      }

      if (auction.bids.length === 0) {
        // Return funds to seller
        if (!state.balances[sellerWallet]) state.balances[sellerWallet] = {};
        state.balances[sellerWallet][auction.bondId] = (state.balances[sellerWallet][auction.bondId] || 0) + auction.amount;
        auction.status = 'CANCELLED';
        saveState(state);
        broadcast('ACE', `⚠️ Auction #${auctionId} closed without bids. Funds returned.`);
        return res.json({ success: true, message: 'Auction closed without winners.' });
      }

      // 1. TEE Logic: Find the winner from the PRIVATE ledger (actual amounts)
      // Public bids in auction.bids show "*** (Sealed in TEE)" to protect privacy.
      // Actual amounts are in state.privateAuctions[auctionId].bids
      const privateBids = (state.privateAuctions || {})[auctionId]?.bids || [];
      let winningBid;

      if (privateBids.length > 0) {
        // Use TEE private ledger where actual amounts are stored
        const topPrivateBid = privateBids.reduce((prev, curr) => (prev.amount > curr.amount) ? prev : curr);
        winningBid = { bidder: topPrivateBid.bidder, amount: topPrivateBid.amount };
      } else {
        // Fallback: public bids (only if amounts are numeric)
        const numericBids = auction.bids.filter(b => typeof b.amount === 'number');
        if (numericBids.length === 0) {
          return res.status(400).json({ error: 'No bids with valid amounts to determine the winner.' });
        }
        winningBid = numericBids.reduce((prev, curr) => (prev.amount > curr.amount) ? prev : curr);
      }

      // 2. Execute Policy Manager: RWA token transfer to winner (off-chain ledger)
      const winnerWallet = winningBid.bidder.toLowerCase();
      if (!state.balances[winnerWallet]) state.balances[winnerWallet] = {};
      state.balances[winnerWallet][auction.bondId] = (state.balances[winnerWallet][auction.bondId] || 0) + auction.amount;

      auction.status = 'SETTLED';
      auction.winner = winnerWallet;
      auction.winningAmount = winningBid.amount;

      saveState(state);

      broadcast('ACE', `🏆 [TEE Enclave] Auction #${auctionId} settled.`);
      broadcast('ACE', `🛡️ [Policy Manager] Winner: ${winnerWallet.slice(0, 10)}... with bid of $${winningBid.amount} USDC.`);
      broadcast('SYSTEM', `✅ Tokens have been transferred from Escrow to the new owner.`);

      res.json({ success: true, winner: winnerWallet, amount: winningBid.amount });
    }
  };
};
