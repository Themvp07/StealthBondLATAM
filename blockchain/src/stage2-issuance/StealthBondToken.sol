// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {
    ERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {
    Initializable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title StealthBondToken
/// @notice Tokenized representation of RWA (LATAM Bonds).
/// Fractional issuance controlled 100% by Chainlink CRE.
contract StealthBondToken is
    Initializable,
    ERC20Upgradeable,
    PausableUpgradeable
{
    address public creForwarder; // The CRE Oracle that controls the lifecycle
    uint256 public reserveRatio; // Reserve ratio (10000 = 100.00%)

    // Private Hash (Proof of Reserve/Issuer Info) stored off-chain in the TEE
    bytes32 public vaultManifestHash;

    event ReserveRatioUpdated(uint256 newRatio);
    event PrivateTransfer(
        address indexed from,
        address indexed to,
        bytes encryptedAmount
    );

    modifier onlyCRE() {
        require(msg.sender == creForwarder, "Only CRE can execute this");
        _;
    }

    /// @notice An Upgradeable Proxy is used to integrate it later with ACE Issuer if necessary
    function initialize(
        string memory name,
        string memory symbol,
        address _creForwarder,
        bytes32 _manifestHash
    ) public initializer {
        __ERC20_init(name, symbol);
        __Pausable_init();

        creForwarder = _creForwarder;
        vaultManifestHash = _manifestHash;
        reserveRatio = 10000; // 100% por defecto al emitir
    }

    /// @notice The CRE issues fractional tokens when it checks custody at the Bank
    function issueRwaFractions(
        address issuerWallet,
        uint256 amount
    ) external onlyCRE {
        _mint(issuerWallet, amount);
    }

    /// @notice Updates the ratio reported by the Custodian (PoR) and intervenes if necessary
    function updateReserveRatio(uint256 newRatio) external onlyCRE {
        reserveRatio = newRatio;
        emit ReserveRatioUpdated(newRatio);

        if (newRatio < 10000) {
            _pause(); // Emergency pause if below 100%
        } else if (paused()) {
            _unpause(); // Resumes if stabilized
        }
    }

    /// @notice Confidential Transaction (Hackathon point: Privacy)
    /// Instead of moving tokens publicly, it emits an event with an encrypted payload
    /// resolved by the TEE / CCIP in the Off-Chain Vault.
    function transferPrivate(
        address to,
        bytes calldata cipherAmount
    ) external whenNotPaused {
        // In an advanced RWA, a base balance is frozen and the CRE orchestrates the release
        emit PrivateTransfer(msg.sender, to, cipherAmount);
    }

    // Override decimals for $10 USD fractions (e.g., 6 decimals)
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
