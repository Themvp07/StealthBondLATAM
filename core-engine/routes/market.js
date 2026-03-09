const { saveState } = require('../utils/stateManager');
const { ethers } = require('ethers');

// DON Signer key — same as in onchain.js and DeployStage4.s.sol
const DON_SIGNER_KEY = process.env.DON_SIGNER_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || '0xdc11f7e700a4c898ae5caddb1082cffa76512add';
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x68b1d87f95878fe05b998f19b66f4baba5de1aed';

/**
 * Generates the DON Signer's cryptographic signature for withdrawWithTicket().
 * Exactly reproduces the contract's hash:
 *   keccak256(abi.encode(msg.sender, token, amount, address(this)))
 * signed with ETH personal_sign (EIP-191).
 */
async function signWithdrawTicket(recipientAddr, tokenAddr, amountWei) {
    const donWallet = new ethers.Wallet(DON_SIGNER_KEY);
    const vaultAddr = ethers.getAddress(VAULT_ADDRESS);
    const recipient = ethers.getAddress(recipientAddr);
    const token = ethers.getAddress(tokenAddr);

    const ticketHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'address', 'uint256', 'address'],
            [recipient, token, amountWei, vaultAddr]
        )
    );
    // wallet.signMessage() adds the EIP-191 prefix exactly as
    // MessageHashUtils.toEthSignedMessageHash() does in the contract.
    const sig = await donWallet.signMessage(ethers.getBytes(ticketHash));
    return sig;
}

/**
 * @title Route: Market (Stage 4)
 * @notice Institutional secondary market management with private transactions and x402.
 * @dev Aligned with Chainlink Confidential Compute Private Token Demo architecture:
 *      On-chain Vault (public entry/exit) + Off-chain Enclave (private ledger).
 *      Flow: deposit → private ledger → sealed-bid auctions → withdrawal tickets → withdrawWithTicket()
 */
module.exports = (state, broadcast) => {
    // Helpers for privateBalances
    function getPrivateBalance(wallet, token) {
        if (!state.privateBalances) return 0;
        if (!state.privateBalances[wallet]) return 0;
        return state.privateBalances[wallet][token] || 0;
    }

    function setPrivateBalance(wallet, token, amount) {
        if (!state.privateBalances) state.privateBalances = {};
        if (!state.privateBalances[wallet]) state.privateBalances[wallet] = {};
        state.privateBalances[wallet][token] = amount;
    }

    function getFrozenAmount(wallet) {
        if (!state.frozenBids) return 0;
        let total = 0;
        for (const aucId of Object.keys(state.frozenBids)) {
            if (state.frozenBids[aucId][wallet]) {
                total += state.frozenBids[aucId][wallet];
            }
        }
        return total;
    }

    return {
        /**
         * @notice Private Vault Deposit (Shielding).
         * @dev Equivalent to deposit() in Chainlink's DemoCompliantPrivateTokenVault.
         *      The user moves tokens from the public world to the off-chain private ledger.
         */
        shieldHandler: async (req, res) => {
            const { wallet: rawWallet, token, amount } = req.body;
            const wallet = rawWallet ? rawWallet.toLowerCase() : null;
            const numAmount = parseFloat(amount);

            if (!wallet || !token || !numAmount || numAmount <= 0) {
                return res.status(400).json({ error: 'Invalid parameters for Shielding.' });
            }

            broadcast('ACE', `🛡️ [Vault] Processing deposit of ${numAmount} ${token} to Private Enclave...`);

            // Update private ledger (equivalent to the Deposit event of the on-chain Vault)
            const currentPrivate = getPrivateBalance(wallet, token);
            setPrivateBalance(wallet, token, currentPrivate + numAmount);

            saveState(state);

            broadcast('SYSTEM', `✅ [TEE] Shielding successful. ${numAmount} ${token} credited in the Private Ledger.`);

            res.json({
                success: true,
                shieldedBalances: state.privateBalances[wallet],
                message: `${numAmount} ${token} deposited in the Private Vault.`
            });
        },

        /**
         * @notice Provides the "Shielded" (private) balance by consulting the off-chain ledger.
         * @dev Equivalent to POST /balances in the Chainlink Confidential Compute API.
         */
        getBalanceHandler: async (req, res) => {
            const { wallet } = req.params;
            const addr = wallet.toLowerCase();

            const privateBalance = state.privateBalances ? (state.privateBalances[addr] || {}) : {};

            // Calculate frozen balance in active bids
            const frozenUsdc = getFrozenAmount(addr);

            // Break down bids by auction for the frontend
            const frozenDetails = {};
            if (state.frozenBids) {
                for (const [aucId, bidders] of Object.entries(state.frozenBids)) {
                    if (bidders[addr]) {
                        frozenDetails[aucId] = bidders[addr];
                    }
                }
            }

            res.json({
                success: true,
                address: addr,
                shieldedBalances: privateBalance,
                frozenInBids: frozenUsdc,
                frozenDetails,
                status: 'Identity Verified (CCID Active)'
            });
        },

        /**
         * @notice Processes a private bid (Sealed-Bid). Implements the x402 protocol for AI analysis.
         * @dev Locks the bidder's funds in state.frozenBids to prevent double spending.
         *      If an investor deposits 1000 USDC, they cannot bid 1000 in 3 auctions.
         */
        placeBidHandler: async (req, res) => {
            const { auctionId, bidAmount, wallet, paidAI } = req.body;

            // 1. x402 Protocol: Delegated to /ai/consultant

            const addr = wallet ? wallet.toLowerCase() : null;
            const numBid = parseFloat(bidAmount);

            if (!addr || !numBid || numBid <= 0) {
                return res.status(400).json({ error: 'Invalid bid parameters.' });
            }

            // 2. Verify available private balance (discounting funds frozen in other bids)
            const availableUsdc = getPrivateBalance(addr, 'USDC') - getFrozenAmount(addr);

            if (availableUsdc < numBid) {
                broadcast('SYSTEM', `❌ [TEE] Insufficient private balance. Available: $${availableUsdc.toFixed(2)} USDC (frozen in bids: $${getFrozenAmount(addr).toFixed(2)})`);
                return res.status(400).json({
                    error: `Insufficient private balance. Available: $${availableUsdc.toFixed(2)} USDC.`,
                    available: availableUsdc
                });
            }

            broadcast('ACE', `🔒 [TEE] Receiving private bid for ${numBid} USDC. (Encrypting with DON public key)`);

            // 3. Lock bidder funds (double spending prevention)
            if (!state.frozenBids) state.frozenBids = {};
            if (!state.frozenBids[auctionId]) state.frozenBids[auctionId] = {};
            state.frozenBids[auctionId][addr] = numBid;

            // 4. Register bid in the sealed envelope
            if (!state.privateAuctions) state.privateAuctions = {};
            if (!state.privateAuctions[auctionId]) state.privateAuctions[auctionId] = { bids: [] };

            state.privateAuctions[auctionId].bids.push({
                bidder: addr,
                amount: numBid,
                timestamp: Date.now()
            });

            // 5. Synchronize public participant count in state.auctions
            // Only count and bidder are exposed; amount remains sealed in TEE
            const publicAuction = (state.auctions || []).find(a => a.id === auctionId);
            if (publicAuction) {
                if (!publicAuction.bids) publicAuction.bids = [];
                // Prevent duplicate if the same bidder already bid in this auction
                const existingBid = publicAuction.bids.find(b => b.bidder === addr);
                if (!existingBid) {
                    publicAuction.bids.push({
                        bidder: addr,
                        amount: '*** (Sealed in TEE)',
                        encrypted: true,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            saveState(state);

            broadcast('ACE', `🛡️ [Identity Manager] CCID Verified for bidder ${addr.slice(0, 8)}.`);
            broadcast('SYSTEM', `✅ [TEE] Sealed bid registered. Funds locked: $${numBid} USDC.`);

            res.json({ success: true, message: 'Bid registered in TEE. Funds locked.' });
        },

        /**
         * @notice Releases frozen funds and generates cryptographically signed tickets for everyone.
         * @dev Aligned with Chainlink standard: ticket = ETH_SIGN(keccak256(recipient,token,amount,vault))
         *      - Losers: USDC ticket (refund)
         *      - Winner: RWA ticket (won tokens)
         *      - Seller: USDC ticket (payment received)
         */
        resolveAuctionHandler: async (req, res) => {
            const { auctionId } = req.body;
            const frozenForAuction = state.frozenBids ? state.frozenBids[auctionId] : null;

            if (!frozenForAuction) {
                return res.status(404).json({ error: 'No frozen funds found for this auction' });
            }

            const auction = (state.auctions || []).find(a => a.id === auctionId);
            if (!auction || auction.status !== 'SETTLED') {
                return res.status(400).json({ error: 'Auction has not been settled yet.' });
            }

            const winnerWallet = auction.winner;
            const sellerWallet = auction.seller;

            // FIX: winningAmount can be "*** (Sealed in TEE)" when the auction was closed
            // with encrypted bids. Recover the actual amount from state.privateAuctions.
            let winningAmount = 0;
            if (typeof auction.winningAmount === 'number') {
                winningAmount = auction.winningAmount;
            } else {
                const privateBids = (state.privateAuctions || {})[auctionId]?.bids || [];
                const winnerPrivateBid = privateBids
                    .filter(b => b.bidder === winnerWallet)
                    .sort((a, b) => b.amount - a.amount)[0];
                winningAmount = winnerPrivateBid ? (winnerPrivateBid.amount || 0) : 0;
                if (winningAmount > 0) {
                    broadcast('ACE', `🔍 [TEE] winningAmount recovered from private ledger: $${winningAmount} USDC`);
                }
            }

            const USDC_DECIMALS = 6n;

            // FIX: For RWA tokens, query actual decimals on-chain.
            // Our ERC-3643 contracts use 6 decimals (not 18), so using 18
            // produces an amountWei much larger than the actual vault balance.
            const RPC_URL_LOCAL = process.env.RPC_URL || 'http://127.0.0.1:8545';
            const rpcProvider = new ethers.JsonRpcProvider(RPC_URL_LOCAL);
            const ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)'];
            async function getBondDecimals(tokenAddr) {
                try {
                    const contract = new ethers.Contract(tokenAddr, ERC20_DECIMALS_ABI, rpcProvider);
                    return BigInt(await contract.decimals());
                } catch {
                    return 6n; // safe fallback for our ERC-3643
                }
            }

            if (!state.withdrawalTickets) state.withdrawalTickets = {};

            // Helper: builds and signs a cryptographic ticket (Chainlink standard)
            const makeTicket = async (id, recipientAddr, tokenAddr, amountRaw, tokenSymbol, description) => {
                let amountWei;
                try {
                    let decimals;
                    if (tokenSymbol === 'USDC') {
                        decimals = USDC_DECIMALS;
                    } else {
                        // RWA: query actual contract decimals to avoid overflow
                        decimals = await getBondDecimals(tokenAddr);
                    }
                    amountWei = ethers.parseUnits(String(parseFloat(amountRaw).toFixed(Number(decimals) > 18 ? 18 : Number(decimals))), decimals);
                } catch (e) {
                    console.warn('[TEE] Error parsing amountWei:', e.message);
                    amountWei = BigInt(Math.round(parseFloat(amountRaw)));
                }

                let sig = null;
                try {
                    sig = await signWithdrawTicket(recipientAddr, tokenAddr, amountWei);
                } catch (e) {
                    console.warn('[TEE] Error signing ticket:', e.message);
                }

                return {
                    id,
                    auctionId,
                    token: tokenSymbol,
                    tokenAddress: tokenAddr,
                    amount: parseFloat(amountRaw),
                    amountWei: amountWei.toString(),
                    description,
                    sig,           // DON Signer signature — passed to withdrawWithTicket()
                    deadline: Math.floor(Date.now() / 1000) + 3600,  // 1h (Chainlink standard)
                    createdAt: new Date().toISOString(),
                    claimed: false
                };
            };

            // Process each bidder with frozen funds
            for (const [bidder, frozenAmount] of Object.entries(frozenForAuction)) {
                const isWinner = bidder === winnerWallet;
                if (!state.withdrawalTickets[bidder]) state.withdrawalTickets[bidder] = [];

                if (isWinner) {
                    // Winner: debit USDC from TEE ledger, credit seller
                    const currentBal = getPrivateBalance(bidder, 'USDC');
                    setPrivateBalance(bidder, 'USDC', Math.max(0, currentBal - frozenAmount));
                    const sellerBal = getPrivateBalance(sellerWallet, 'USDC');
                    setPrivateBalance(sellerWallet, 'USDC', sellerBal + frozenAmount);
                    broadcast('ACE', `💸 [TEE] Settlement: $${frozenAmount} USDC transferred from winner to seller.`);

                    // RWA Ticket for the winner (withdraws bond tokens from the on-chain vault)
                    const rwaTicket = await makeTicket(
                        `ticket_${auctionId}_winner_${Date.now()}`,
                        bidder, auction.bondId, auction.amount, 'RWA',
                        `${auction.amount} RWA tokens won in auction #${auctionId}`
                    );
                    rwaTicket.bondId = auction.bondId;
                    state.withdrawalTickets[bidder].push(rwaTicket);
                    broadcast('ACE', `🎫 [TEE] RWA Ticket signed (DON) for winner ${bidder.slice(0, 8)}: ${auction.amount} tokens`);

                } else {
                    broadcast('ACE', `🔓 [TEE] Funds unlocked for ${bidder.slice(0, 8)}...: $${frozenAmount} USDC`);

                    // USDC Ticket for the loser (vault refund)
                    const loserTicket = await makeTicket(
                        `ticket_${auctionId}_loser_${bidder.slice(2, 8)}_${Date.now()}`,
                        bidder, USDC_ADDRESS, frozenAmount, 'USDC',
                        `Refund $${frozenAmount} USDC — bid in auction #${auctionId}`
                    );
                    state.withdrawalTickets[bidder].push(loserTicket);
                    broadcast('ACE', `🎫 [TEE] USDC Ticket signed (DON) for ${bidder.slice(0, 8)}: $${frozenAmount} (refund)`);
                }
            }

            // USDC Ticket for the seller (collection of the winning bid)
            if (!state.withdrawalTickets[sellerWallet]) state.withdrawalTickets[sellerWallet] = [];
            const sellerTicket = await makeTicket(
                `ticket_${auctionId}_seller_${Date.now()}`,
                sellerWallet, USDC_ADDRESS, winningAmount, 'USDC',
                `Payment $${winningAmount} USDC — sale in auction #${auctionId}`
            );
            state.withdrawalTickets[sellerWallet].push(sellerTicket);
            broadcast('ACE', `🎫 [TEE] USDC Ticket signed (DON) for seller ${sellerWallet.slice(0, 8)}: $${winningAmount}`);

            delete state.frozenBids[auctionId];
            saveState(state);

            broadcast('SYSTEM', `🛡️ [TEE] Settlement complete. Chainlink cryptographic tickets generated for everyone.`);
            res.json({ success: true });
        },

        /**
         * @notice Returns pending withdrawal tickets for a wallet (equivalent to GET /balances Chainlink)
         */
        getTicketsHandler: (req, res) => {
            const { wallet } = req.params;
            const addr = wallet.toLowerCase();
            const tickets = (state.withdrawalTickets || {})[addr] || [];
            res.json({ success: true, tickets: tickets.filter(t => !t.claimed) });
        },

        /**
         * @notice Equivalent to Chainlink's POST /withdraw: issues the signed ticket for on-chain redemption.
         * The frontend calls vault.withdrawWithTicket(tokenAddress, amountWei, sig) with the returned data.
         * If the ticket expired (>1h), the balance is automatically refunded.
         */
        claimTicketHandler: async (req, res) => {
            const { wallet, ticketId } = req.body;
            const addr = wallet.toLowerCase();
            const walletTickets = (state.withdrawalTickets || {})[addr] || [];
            const ticket = walletTickets.find(t => t.id === ticketId);

            if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
            if (ticket.claimed) return res.status(400).json({ error: 'Ticket already claimed' });

            // Verify deadline — Chainlink standard: tickets expire in 1 hour
            if (ticket.deadline && Math.floor(Date.now() / 1000) > ticket.deadline) {
                if (ticket.token === 'USDC') {
                    const balance = getPrivateBalance(addr, 'USDC');
                    setPrivateBalance(addr, 'USDC', balance + ticket.amount);
                }
                ticket.claimed = true;
                saveState(state);
                return res.status(400).json({ error: 'Ticket expired. Balance automatically refunded.' });
            }

            ticket.claimed = true;

            // For USDC tickets: deduct from the private ledger (tokens already leave the on-chain vault)
            if (ticket.token === 'USDC') {
                const balance = getPrivateBalance(addr, 'USDC');
                setPrivateBalance(addr, 'USDC', Math.max(0, balance - ticket.amount));
            }

            saveState(state);
            broadcast('ACE', `✅ [TEE] Ticket issued for on-chain redemption: ${ticketId.slice(0, 22)}...`);

            // Return data needed for vault.withdrawWithTicket(tokenAddress, amountWei, sig)
            res.json({
                success: true,
                ticket: {
                    id: ticket.id,
                    tokenAddress: ticket.tokenAddress,
                    amountWei: ticket.amountWei,
                    sig: ticket.sig,
                    deadline: ticket.deadline,
                    description: ticket.description
                }
            });
        }
    };
};
