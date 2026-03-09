// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    ComplianceTokenERC3643
} from "@chainlink/ace/tokens/erc-3643/src/ComplianceTokenERC3643.sol";

/// @title StealthBondERC3643
/// @notice Tokenized representation of RWA (LATAM Bonds).
/// Inherits fully from the official Chainlink ACE standard (ComplianceTokenERC3643).
contract StealthBondERC3643 is ComplianceTokenERC3643 {
    address public factory; // The Factory that controls the lifecycle
    uint256 public reserveRatio; // Reserve ratio (10000 = 100.00%)

    // Private Hash (Proof of Reserve/Issuer Info) stored off-chain in the TEE
    bytes32 public vaultManifestHash;

    event ReserveRatioUpdated(uint256 newRatio);
    event PrivateTransfer(
        address indexed from,
        address indexed to,
        bytes encryptedAmount
    );

    modifier onlyFactory() {
        require(
            msg.sender == factory,
            "StealthBond: Only Factory can execute this"
        );
        _;
    }

    /// @notice Constructor to disable initializers in the logic implementation
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the RWA token proxy
    function initializeStealthBond(
        string calldata tokenName,
        string calldata tokenSymbol,
        uint8 tokenDecimals,
        address _policyEngine,
        address _factory,
        bytes32 _manifestHash
    ) public initializer {
        __ComplianceTokenERC3643_init(
            tokenName,
            tokenSymbol,
            tokenDecimals,
            _policyEngine
        );

        factory = _factory;
        vaultManifestHash = _manifestHash;
        reserveRatio = 10000; // 100% by default upon issuance

        // Start paused simulating required freezing when minting RWAs
        getComplianceTokenStorage().tokenPaused = true;
    }

    /// @notice Issues fractional tokens when the Factory (backed by TEE) orders it
    function issueRwaFractions(
        address issuerWallet,
        uint256 amount
    ) external onlyFactory {
        _mint(issuerWallet, amount);
    }

    /// @notice Updates the ratio reported by the Custodian (PoR) and intervenes if necessary
    function updateReserveRatio(uint256 newRatio) external onlyFactory {
        reserveRatio = newRatio;
        emit ReserveRatioUpdated(newRatio);

        if (newRatio < 10000) {
            getComplianceTokenStorage().tokenPaused = true;
        } else if (getComplianceTokenStorage().tokenPaused) {
            getComplianceTokenStorage().tokenPaused = false;
        }
    }

    /// @notice Confidential Transaction (Hackathon point: Privacy)
    function transferPrivate(
        address to,
        bytes calldata cipherAmount
    ) external whenNotPaused {
        // In a real advanced RWA, hidden transfers emit this event
        // to be orchestrated by a TEE in the Vault.
        emit PrivateTransfer(msg.sender, to, cipherAmount);
    }
}
