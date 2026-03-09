/**
 * @title Stage 4 - Market Types
 * @notice Definitions for private auction flow and withdrawal tickets.
 */

export interface PrivateBid {
    bidder: string;
    amount: string; // Amount in wei (string for precision)
    timestamp: number;
}

export interface AuctionResult {
    auctionId: number;
    winner: string;
    finalPrice: string;
    seller: string;
    rwaToken: string;
    rwaAmount: string;
}

export interface WithdrawalTicket {
    token: string;
    amount: string;
    recipient: string;
    vault: string;
    signature: string;
}
