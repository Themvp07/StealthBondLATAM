// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {
    PolicyProtectedUpgradeable
} from "@chainlink/policy-management/core/PolicyProtectedUpgradeable.sol";
import {
    Initializable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    IIdentityRegistry
} from "@chainlink/cross-chain-identity/interfaces/IIdentityRegistry.sol";
import {
    ICredentialRegistry
} from "@chainlink/cross-chain-identity/interfaces/ICredentialRegistry.sol";

/// @title CREComplianceIssuer
/// @notice Authorized Receiver Contract (Issuer) for registering institutional and retail identities
/// validated by the Chainlink CRE Off-Chain network (via TEE). Replaces the monolithic AgentRegistry.
contract CREComplianceIssuer is Initializable, PolicyProtectedUpgradeable {
    // State Variables in Namespaced Structures (Avoid Storage Collisions in ERC1967 Proxies)
    // Define the slot manually following the ERC-7201 pattern
    struct IssuerStorage {
        address creForwarder;
        uint256 lastReportReceived;
        IIdentityRegistry identityRegistry;
        ICredentialRegistry credentialRegistry;
    }

    // keccak256(abi.encode(uint256(keccak256("stealthbond.storage.CREComplianceIssuer")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant ISSUER_STORAGE_LOCATION =
        0xea7a0b3e6d8a395b0c96c4af593eaf22a96ba93be3d4d00870f7cfcb25b80a00;

    /// @notice Event emitted by this contract when it successfully processes a TEE report
    event ComplianceOnChainStored(
        bytes32 indexed ccid,
        address indexed wallet,
        bytes32 credentialTypeId
    );

    function _getIssuerStorage()
        private
        pure
        returns (IssuerStorage storage $)
    {
        assembly {
            $.slot := ISSUER_STORAGE_LOCATION
        }
    }

    /// @notice Proxy contract initialization function.
    /// @param _initialOwner Initial owner of the contract
    /// @param _policyEngine Address of the deployed PolicyEngine
    /// @param _creForwarder Public address of the CRE network that will issue reports to this contract
    /// @param _identityRegistry Address of the ACE identity registry
    /// @param _credentialRegistry Address of the ACE credential registry
    function initialize(
        address _initialOwner,
        address _policyEngine,
        address _creForwarder,
        address _identityRegistry,
        address _credentialRegistry
    ) public initializer {
        // Initialize the base contract inherited from ACE
        __PolicyProtected_init(_initialOwner, _policyEngine);

        // Configure the proxy's local data
        IssuerStorage storage $ = _getIssuerStorage();
        $.creForwarder = _creForwarder;
        $.identityRegistry = IIdentityRegistry(_identityRegistry);
        $.credentialRegistry = ICredentialRegistry(_credentialRegistry);
    }

    /// @notice On-Chain entry point for the Hackathon. Receives reports from CRE.
    /// @dev Protected by `runPolicy` to ensure ONLY the authorized `_creForwarder` executes it.
    /// @param metadata Static payload (not used in this flow step)
    /// @param reportPayload Decodable payload with CCID, Wallet, Credential ID, and Lifespan (Expiration)
    function onReport(
        bytes calldata metadata,
        bytes calldata reportPayload
    ) external runPolicy {
        // Mark reception
        IssuerStorage storage $ = _getIssuerStorage();
        $.lastReportReceived = block.timestamp;

        // Destructure the encrypted report issued by our Chainlink CRE TEE workflow.
        // Expected bytes format to decode:
        // - bytes32 ccid: The universal cross-chain identifier of the person/company
        // - address wallet: The cryptographic wallet that interacted
        // - bytes32 credentialTypeId: W3C ID of the approved Credential (e.g., VENEZUELA_KYC_PASSED)
        // - uint40 expiresAt: Expiration date of the regulatory approval
        (
            bytes32 ccid,
            address wallet,
            bytes32 credentialTypeId,
            uint40 expiresAt
        ) = abi.decode(reportPayload, (bytes32, address, bytes32, uint40));

        // =========================================================================
        // Phase 3: Communication with Global Registries
        // =========================================================================

        // 1. Identify / Register the CCID - if it doesn't exist, create it
        if ($.identityRegistry.getIdentity(wallet) == bytes32(0)) {
            $.identityRegistry.registerIdentity(ccid, wallet, new bytes(0));
        }

        // 2. Check for the existence of the credential
        bool hasCredential = false;
        try $.credentialRegistry.getCredential(ccid, credentialTypeId) returns (
            ICredentialRegistry.Credential memory
        ) {
            hasCredential = true;
        } catch {}
        // 3. Issue or renew the modular credential
        if (hasCredential) {
            $.credentialRegistry.renewCredential(
                ccid,
                credentialTypeId,
                expiresAt,
                new bytes(0)
            );
        } else {
            $.credentialRegistry.registerCredential(
                ccid,
                credentialTypeId,
                expiresAt,
                metadata,
                new bytes(0)
            );
        }

        // Emit so that the Frontend and the CRE Network verify successful reception
        emit ComplianceOnChainStored(ccid, wallet, credentialTypeId);
    }

    // =========================================================================
    // Backward Compatibility Functions (Frontend v1)
    // =========================================================================

    /// @notice Evaluates if the user has an active and valid cross-chain identity
    function isVerified(
        address wallet,
        uint256 /* minLevel */
    ) external view returns (bool) {
        IssuerStorage storage $ = _getIssuerStorage();
        bytes32 ccid = $.identityRegistry.getIdentity(wallet);
        if (ccid == bytes32(0)) return false;

        // Checks if it has any non-expired credential
        bytes32[] memory types = $.credentialRegistry.getCredentialTypes(ccid);
        if (types.length == 0) return false;

        for (uint i = 0; i < types.length; i++) {
            if (!$.credentialRegistry.isCredentialExpired(ccid, types[i])) {
                return true;
            }
        }
        return false;
    }

    /// @notice Simulates the reading of the Stage 2 Identity struct
    function registry(
        address wallet
    )
        external
        view
        returns (
            uint8 entityType,
            bytes32 ccid,
            address tutor,
            uint256 level,
            bool active
        )
    {
        IssuerStorage storage $ = _getIssuerStorage();
        ccid = $.identityRegistry.getIdentity(wallet);

        if (ccid == bytes32(0)) {
            return (0, bytes32(0), address(0), 0, false);
        }

        bool isActive = false;
        bytes32[] memory types = $.credentialRegistry.getCredentialTypes(ccid);

        // Deduce type based on credentials (Simplification for Company=2)
        uint8 eType = 2;

        if (types.length > 0) {
            isActive = !$.credentialRegistry.isCredentialExpired(
                ccid,
                types[0]
            );
        }

        return (eType, ccid, address(0), 1, isActive);
    }

    function getForwarder() external view returns (address) {
        IssuerStorage storage $ = _getIssuerStorage();
        return $.creForwarder;
    }
}
