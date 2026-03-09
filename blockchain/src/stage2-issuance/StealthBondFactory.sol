// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    PolicyProtectedUpgradeable
} from "@chainlink/policy-management/core/PolicyProtectedUpgradeable.sol";
import {
    Initializable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// Interfaces CCIP Oficiales
import {
    IRouterClient
} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {
    Client
} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";

// Import StealthBondERC3643
import {StealthBondERC3643} from "./StealthBondERC3643.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title StealthBondFactory
/// @notice Multi-chain Orchestration Engine of StealthBond.
/// Acts as the Master Issuer authorized by Chainlink CRE.
contract StealthBondFactory is Initializable, PolicyProtectedUpgradeable {
    // Factory variables
    address public creForwarder;
    address public tokenPolicyEngine; // ACE Policy Engine to inject into RWAs
    address public baseTokenImplementation; // ERC-3643 template

    // Variables CCIP
    IRouterClient public router;
    IERC20 public linkToken;
    uint64 public destinationChainSelector;

    event BondIssued(
        uint256 indexed bondId,
        address rwaToken,
        bytes32 vaultCipher
    );
    event MessageSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector
    );

    struct VaultManifest {
        uint256 bondId;
        uint256 nominalValue;
        bytes32 cipherHash; // IPFS/DON Vault Data. Private conditions
        address issuerWallet;
        address tokenContract;
        string chainDestination;
    }

    mapping(uint256 => VaultManifest) public manifests;
    uint256 public nextBondId = 1;

    /// @notice Deployed via proxy
    function initialize(
        address _initialOwner,
        address _policyEngine,
        address _creForwarder,
        address _tokenPolicyEngine, // Policy engine for token compliance
        address _tokenImpl,
        address _router,
        address _link
    ) public initializer {
        __PolicyProtected_init(_initialOwner, _policyEngine);
        creForwarder = _creForwarder;
        tokenPolicyEngine = _tokenPolicyEngine;
        baseTokenImplementation = _tokenImpl;
        router = IRouterClient(_router);
        linkToken = IERC20(_link);
        nextBondId = 1;
    }

    /// @notice Function protected by the CRE oracle (Confidential Compute)
    function issueBond(
        uint256 nominalValue,
        bytes32 cipherHash,
        address issuerWallet,
        string calldata network,
        uint64 destChainSelector
    ) external runPolicy returns (uint256 bondId) {
        // 1. Clone ERC-3643 Minimal Proxy
        address newTokenProxy = Clones.clone(baseTokenImplementation);

        // 2. Initialize Token
        StealthBondERC3643(newTokenProxy).initializeStealthBond(
            "StealthBond VZLA RWA",
            "SBRWA",
            6, // 6 decimals for USD
            tokenPolicyEngine, // Assigns policy for ERC3643 compliance rules (isVerified)
            address(this),
            cipherHash
        );

        // 3. Initial minting (The token auto-pauses)
        StealthBondERC3643(newTokenProxy).issueRwaFractions(
            issuerWallet,
            nominalValue
        );

        // 4. Internal Custody Registry
        bondId = nextBondId++;
        manifests[bondId] = VaultManifest({
            bondId: bondId,
            nominalValue: nominalValue,
            cipherHash: cipherHash,
            issuerWallet: issuerWallet,
            tokenContract: newTokenProxy,
            chainDestination: network
        });

        emit BondIssued(bondId, newTokenProxy, cipherHash);

        // 5. Real CCIP Sinking automation
        if (destChainSelector > 0 && address(router) != address(0)) {
            _ccipSend(destChainSelector, bondId, newTokenProxy, cipherHash);
        }

        return bondId;
    }

    /// @notice Allows the reserve oracle (PoR) to update the ratio of a bond.
    /// Protected so that only the authorized Forwarder (TEE) can report financial health.
    function updateReserveRatio(
        uint256 bondId,
        uint256 newRatio
    ) external runPolicy {
        VaultManifest storage m = manifests[bondId];
        require(m.tokenContract != address(0), "Factory: Bond not found");

        StealthBondERC3643(m.tokenContract).updateReserveRatio(newRatio);
    }

    /// @notice Sends the CCIP inter-network message to register the bond there with native LINK
    function _ccipSend(
        uint64 _destinationChainSelector,
        uint256 bondId,
        address tokenContract,
        bytes32 cipherHash
    ) internal {
        // Dummy receiver on testnet / local (Could be a real receiver contract on the final network)
        address receiver = address(0xCC18);

        bytes memory dataPayload = abi.encode(
            bondId,
            tokenContract,
            cipherHash
        );

        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: dataPayload,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({
                    gasLimit: 200_000,
                    allowOutOfOrderExecution: true
                })
            ),
            feeToken: address(linkToken) // Pago en LINK
        });

        uint256 fees = router.getFee(_destinationChainSelector, evm2AnyMessage);
        require(
            linkToken.balanceOf(address(this)) >= fees,
            "No/Not enough LINK to pay fees"
        );

        linkToken.approve(address(router), fees);

        bytes32 messageId = router.ccipSend(
            _destinationChainSelector,
            evm2AnyMessage
        );

        emit MessageSent(messageId, _destinationChainSelector);
    }
}
