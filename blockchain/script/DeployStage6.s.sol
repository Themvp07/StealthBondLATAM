// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {
    RegulatoryReportLedger
} from "../src/stage6-reports/RegulatoryReportLedger.sol";

/// @title DeployStage6
/// @notice Deploys the RegulatoryReportLedger for Stage 6 (Risk & Compliance + Privacy)
/// @dev This script is independent and DOES NOT affect contracts from Stages 1-5.
///      It is executed after the base ecosystem is deployed.
///
///      Uso: forge script script/DeployStage6.s.sol:DeployStage6 --broadcast --rpc-url http://127.0.0.1:8545
contract DeployStage6 is Script {
    function run() external {
        // Deployer = Anvil Account #0 (same account that deploys the entire ecosystem)
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Oracle Authority = Deployer (in production it would be the Chainlink CRE DON Signer)
        address oracleAuthority = deployer;

        // Regulator = SUNAVAL (user's MetaMask wallet, index 7 of SeedWallets.s.sol)
        address regulatorAddress = 0xA66854B2Df0dd19b96af382336721b61F222DDFf;

        console.log("====================================================");
        console.log("STAGE 6: Deploying RegulatoryReportLedger");
        console.log("====================================================");
        console.log("Oracle Authority:", oracleAuthority);
        console.log("Regulator (SUNAVAL):", regulatorAddress);

        vm.startBroadcast(deployerPrivateKey);

        RegulatoryReportLedger ledger = new RegulatoryReportLedger(
            oracleAuthority,
            regulatorAddress
        );

        vm.stopBroadcast();

        console.log("RegulatoryReportLedger deployed at:", address(ledger));
        console.log("====================================================");
    }
}
