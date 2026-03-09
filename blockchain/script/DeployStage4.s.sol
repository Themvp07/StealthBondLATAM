// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {
    ERC1967Proxy
} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {StealthVaultEscrow} from "../src/stage4-market/StealthVaultEscrow.sol";

/**
 * @title DeployStage4
 * @notice Script to deploy the Private Transactions Vault (Stage 4).
 * Integrates Phase 1 CCID validation.
 */
contract DeployStage4 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(
                0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
            )
        );
        address deployer = vm.addr(deployerPrivateKey);

        // Addresses detected from previous deployment (Anvil run-latest.json)
        address policyEngine = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
        address complianceIssuer = 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853;
        address donSigner = deployer; // We use the deployer as a mock for the DON Signer

        vm.startBroadcast(deployerPrivateKey);

        console.log("=== DEPLOYING STEALTH VAULT ESCROW (STAGE 4) ===");

        // 1. Deploy Implementation
        StealthVaultEscrow vaultImpl = new StealthVaultEscrow();
        console.log("Vault Implementation deployed at:", address(vaultImpl));

        // 2. Deploy Proxy and Initialize with all parameters
        bytes memory initData = abi.encodeWithSelector(
            StealthVaultEscrow.initialize.selector,
            deployer, // _initialOwner
            policyEngine, // _policyEngine
            donSigner, // _donSigner
            complianceIssuer // _complianceIssuer
        );

        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            initData
        );
        address vaultAddress = address(vaultProxy);
        StealthVaultEscrow vault = StealthVaultEscrow(vaultAddress);

        console.log("StealthVaultEscrow Proxy deployed at:", vaultAddress);
        console.log("Linked to CCID Issuer:", complianceIssuer);

        // Step 5 (Chainlink README): Register tokens on Vault BEFORE any deposits.
        // USDC: policyEngine = address(0) because compliance is validated via
        // onlyVerified(CCID) in the Vault, not by token policy.
        // RWA bonds are dynamically registered in the backend when creating each auction.
        address usdcAddress = 0x68B1D87F95878fE05B998F19b66F4baba5De1aed;
        vault.registerToken(usdcAddress, address(0));
        console.log("USDC registered in the Vault:", usdcAddress);

        vm.stopBroadcast();

        console.log("\nPhase 4 Deployment Completed.");
    }
}
