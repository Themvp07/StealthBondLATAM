// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {
    ERC1967Proxy
} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PolicyEngine} from "@chainlink/policy-management/core/PolicyEngine.sol";
import {
    IdentityRegistry
} from "@chainlink/cross-chain-identity/IdentityRegistry.sol";
import {
    CredentialRegistry
} from "@chainlink/cross-chain-identity/CredentialRegistry.sol";
import {
    OnlyAuthorizedSenderPolicy
} from "@chainlink/policy-management/policies/OnlyAuthorizedSenderPolicy.sol";
import {Policy} from "@chainlink/policy-management/core/Policy.sol";
import {
    CREComplianceIssuer
} from "../src/stage1-identity/CREComplianceIssuer.sol";

/// @title DeployStage1Company
/// @notice Main deployment script for Phase 3, where we initialize
/// the entire Chainlink ACE mesh (Engine, Registries) and our custom Issuer.
contract DeployStage1Company is Script {
    PolicyEngine public policyEngine;
    IdentityRegistry public identityRegistry;
    CredentialRegistry public credentialRegistry;
    CREComplianceIssuer public issuer;
    address public deployer;
    address public creForwarder;

    function run() public {
        // In Foundry: vm.envOr returns the value if it exists, or the default if it doesn't exist
        // fallback (temporarily hardcoded) for compatibility with the --private-key flag
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(deployerPrivateKey);

        // Real or mock address of the CRE node that will send the transactions
        creForwarder = vm.envOr("CRE_FORWARDER", deployer);

        vm.startBroadcast(deployerPrivateKey);

        console.log("=== DEPLOYING CHAINLINK ACE INFRASTRUCTURE ===");

        // 1. Deploy PolicyEngine
        PolicyEngine policyEngineImpl = new PolicyEngine();
        bytes memory policyEngineData = abi.encodeWithSelector(
            PolicyEngine.initialize.selector,
            true, // defaultAllow = true (So filter policies like OnlyAuthorizedSenderPolicy that return 'Continue' are not blocked at the end)
            deployer
        );
        policyEngine = PolicyEngine(
            address(
                new ERC1967Proxy(address(policyEngineImpl), policyEngineData)
            )
        );
        console.log("PolicyEngine desplegado en:", address(policyEngine));

        // 2. Deploy IdentityRegistry
        IdentityRegistry identityImpl = new IdentityRegistry();
        bytes memory identityData = abi.encodeWithSelector(
            IdentityRegistry.initialize.selector,
            address(policyEngine),
            deployer
        );
        identityRegistry = IdentityRegistry(
            address(new ERC1967Proxy(address(identityImpl), identityData))
        );
        console.log("IdentityRegistry deployed at:", address(identityRegistry));

        // 3. Deploy CredentialRegistry
        CredentialRegistry credentialImpl = new CredentialRegistry();
        bytes memory credentialData = abi.encodeWithSelector(
            CredentialRegistry.initialize.selector,
            address(policyEngine),
            deployer
        );
        credentialRegistry = CredentialRegistry(
            address(new ERC1967Proxy(address(credentialImpl), credentialData))
        );
        console.log(
            "CredentialRegistry deployed at:",
            address(credentialRegistry)
        );

        console.log("\n=== DEPLOYING CRE COMPLIANCE ISSUER ===");

        // 4. Deploy our CREComplianceIssuer
        CREComplianceIssuer issuerImpl = new CREComplianceIssuer();
        bytes memory issuerData = abi.encodeWithSelector(
            CREComplianceIssuer.initialize.selector,
            deployer,
            address(policyEngine),
            creForwarder,
            address(identityRegistry),
            address(credentialRegistry)
        );
        issuer = CREComplianceIssuer(
            address(new ERC1967Proxy(address(issuerImpl), issuerData))
        );
        console.log(
            "CREComplianceIssuer (Proxy) deployed at:",
            address(issuer)
        );

        console.log("\n=== APPLYING ON-CHAIN SECURITY POLICIES ===");

        // 5. Configure the policy to protect the Issuer
        // The policy says: Only the `creForwarder` can call functions on the Issuer.
        OnlyAuthorizedSenderPolicy onlySenderPolicyImpl = new OnlyAuthorizedSenderPolicy();
        bytes memory onlySenderData = abi.encodeWithSelector(
            Policy.initialize.selector,
            address(policyEngine),
            deployer,
            new bytes(0)
        );
        OnlyAuthorizedSenderPolicy onlySenderPolicy = OnlyAuthorizedSenderPolicy(
                address(
                    new ERC1967Proxy(
                        address(onlySenderPolicyImpl),
                        onlySenderData
                    )
                )
            );

        onlySenderPolicy.authorizeSender(creForwarder);
        console.log(
            "OnlyAuthorizedSenderPolicy deployed and forwarder authorized"
        );

        // Add the policy to the Issuer's onReport function
        bytes32[] memory emptyParams = new bytes32[](0);

        policyEngine.addPolicy(
            address(issuer),
            CREComplianceIssuer.onReport.selector,
            address(onlySenderPolicy),
            emptyParams
        );
        console.log("Policy connected to CREComplianceIssuer.onReport()");

        // NOTE: In a real Mainnet/Testnet deployment, we would need to authorize
        // the Issuers so they can perform updates on the Identity and Credential Registries.
        // We resolve this by adding the Issuer to the Registries' policies:
        OnlyAuthorizedSenderPolicy registryPolicyImpl = new OnlyAuthorizedSenderPolicy();
        bytes memory registryPolicyData = abi.encodeWithSelector(
            Policy.initialize.selector,
            address(policyEngine),
            deployer,
            new bytes(0)
        );
        OnlyAuthorizedSenderPolicy registryPolicy = OnlyAuthorizedSenderPolicy(
            address(
                new ERC1967Proxy(
                    address(registryPolicyImpl),
                    registryPolicyData
                )
            )
        );

        registryPolicy.authorizeSender(address(issuer));

        policyEngine.addPolicy(
            address(identityRegistry),
            IdentityRegistry.registerIdentity.selector,
            address(registryPolicy),
            emptyParams
        );
        policyEngine.addPolicy(
            address(credentialRegistry),
            CredentialRegistry.registerCredential.selector,
            address(registryPolicy),
            emptyParams
        );
        policyEngine.addPolicy(
            address(credentialRegistry),
            CredentialRegistry.renewCredential.selector,
            address(registryPolicy),
            emptyParams
        );

        console.log(
            "Permissions granted to the Issuer to modify Identity and Credentials."
        );

        vm.stopBroadcast();
        console.log("\nACE and Platform Deployment Completed Successfully.");
    }
}
