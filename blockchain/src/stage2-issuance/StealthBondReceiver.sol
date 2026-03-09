// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    CCIPReceiver
} from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {
    Client
} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";

/// @title StealthBondReceiver
/// @notice CCIP Multi-chain Destination
/// Receives the secure TEE mandate from the factory on Arbitrum/Polygon for token Mirroring
contract StealthBondReceiver is CCIPReceiver {
    event BondMirrored(
        bytes32 indexed messageId,
        address indexed tokenContract,
        bytes32 vaultHash
    );

    // Issuing Factory address (To validate authenticity of cross-chain messages)
    address public allowedSender;

    constructor(address _router, address _allowedSender) CCIPReceiver(_router) {
        allowedSender = _allowedSender;
    }

    /// @notice Method that the official Chainlink CCIP Router would call
    function _ccipReceive(
        Client.Any2EVMMessage memory any2EvmMessage
    ) internal override {
        // We get the decoded data
        (uint256 bondId, address tokenContract, bytes32 vaultHash) = abi.decode(
            any2EvmMessage.data,
            (uint256, address, bytes32)
        );

        // Simulate minting or mirroring of the bond in a Local Destination Vault
        emit BondMirrored(any2EvmMessage.messageId, tokenContract, vaultHash);
    }
}
