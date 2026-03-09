import { cre } from "@chainlink/cre-sdk";
import { PrivateBid, AuctionResult, WithdrawalTicket } from "./types";
import { ethers, keccak256, AbiCoder } from "ethers";

/**
 * @title StealthBond Stage 4 - Private Auction Engine
 * @notice TEE Orchestrator for private auctions and ACE compliance.
 * 
 * FLOW INSIDE THE TEE (Confidential Runtime Environment):
 *   1. Receives private intent (Place Bid / Resolve Auction).
 *   2. ACE Gatekeeping: TEE performs a stealth-read of the IdentityRegistry on-chain to verify the bidder's CCID (Phase 1).
 *   3. Blind Bidding: Logic executes entirely in Enclave RAM; bid amounts are never exposed to the public mempool.
 *   4. Confidential Signing: TEE generates 'Withdrawal Tickets' and signs them using the DON's private key.
 *   5. Cryptographic Security: The StealthVaultEscrow on-chain only obeys signatures generated within this specific TEE enclave.
 */
export async function run(request: any) {
    const action = request.action; // 'place-bid' | 'resolve-auction'
    const params = request.params;

    // Configuration (In production these come from the DON environment)
    const COMPLIANCE_ISSUER_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const VAULT_ADDRESS = params.vaultAddress; // Multi-token blind vault

    if (action === "place-bid") {
        return await handlePlaceBid(params, COMPLIANCE_ISSUER_ADDRESS);
    } else if (action === "resolve-auction") {
        return await handleResolveAuction(params, COMPLIANCE_ISSUER_ADDRESS, VAULT_ADDRESS);
    }

    throw new Error("Action not supported in Stage 4 Market");
}

/**
 * @notice Validates identity in ACE and registers the bid privately.
 */
async function handlePlaceBid(params: any, complianceAddr: string) {
    const { bidder, amount, auctionId, signature } = params;

    // 1. Verify ACE Identity (On-Chain Read from TEE) - Gatekeeping the auction via CCID
    // We use evmRead to check if the user has a valid Phase 1 CCID
    const isVerified = await (cre as any).evmRead({
        address: complianceAddr,
        abi: ["function isVerified(address, uint256) view returns (bool)"],
        functionName: "isVerified",
        args: [bidder, 1]
    });

    if (!isVerified) {
        return { success: false, error: "User does not comply with ACE (CCID required)" };
    }

    // 2. In a real implementation, we would save the encrypted bid here.
    // For the demo, we return an encrypted receipt.
    console.log(`[TEE] Private bid received for auction ${auctionId} - Bidder: ${bidder}`);

    return {
        success: true,
        message: "Bid registered privately in the Enclave",
        shieldedConfirm: keccak256(ethers.toUtf8Bytes(bidder + amount))
    };
}

/**
 * @notice Determines the winner and generates the authorized Withdrawal Tickets.
 */
async function handleResolveAuction(params: any, complianceAddr: string, vaultAddr: string) {
    const { bids, auctionId, seller, rwaToken, rwaAmount } = params;

    // 1. Find the highest bid (Logic executed entirely inside the TEE memory)
    let winnerBid = bids[0];
    for (const bid of bids) {
        if (BigInt(bid.amount) > BigInt(winnerBid.amount)) {
            winnerBid = bid;
        }
    }

    // 2. Generate Ticket for the Seller (USDC payment)- Confidential authorization for withdrawal
    // The seller withdraws the final price from the Vault
    const sellerTicket = await generateTicket(winnerBid.bidder, winnerBid.token, winnerBid.amount, vaultAddr);

    // 3. Generate Ticket for the Winner (RWA Tokens)
    // The winner withdraws the originally deposited bonds
    const winnerTicket = await generateTicket(winnerBid.bidder, rwaToken, rwaAmount, vaultAddr);

    return {
        success: true,
        auctionId,
        winner: winnerBid.bidder,
        finalPrice: winnerBid.amount,
        tickets: {
            seller: sellerTicket,
            winner: winnerTicket
        }
    };
}

/**
 * @notice Cryptographically signs the ticket following the StealthVaultEscrow standard.
 */
async function generateTicket(recipient: string, token: string, amount: string, vault: string) {
    // Recreate the hash that the contract expects: keccak256(abi.encode(recipient, token, amount, vault))
    const abiCoder = AbiCoder.defaultAbiCoder();
    const messageHash = keccak256(
        abiCoder.encode(
            ["address", "address", "uint256", "address"],
            [recipient, token, amount, vault]
        )
    );

    // Sign with the DON key (Confidential Signing - Ensuring the Vault only obeys the TEE)
    const signature = await (cre as any).signEth({
        messageHash: messageHash
    });

    return {
        recipient,
        token,
        amount,
        signature
    };
}
