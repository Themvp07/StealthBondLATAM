// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {DeployStage1Company} from "./DeployStage1Company.s.sol";

/// @title DeployStage1 (Wrapper)
/// @notice Maintains compatibility with the user's original deployment command
/// `forge script script/Deploy.s.sol:DeployStage1 ...`
/// but automatically invokes the entire advanced Chainlink ACE framework (Phases 1 to 3).
contract DeployStage1 is Script {
    function run() external {
        console.log("====================================================");
        console.log("STARTING COMPATIBLE DEPLOYMENT - NOW WITH CHAINLINK ACE");
        console.log("====================================================\n");

        // We simply instantiate and execute the Master Script we built for Companies
        DeployStage1Company aceDeployer = new DeployStage1Company();
        aceDeployer.run();

        console.log("\n====================================================");
        console.log("ORIGINAL DEPLOYMENT COMPLETED VIA ACE WRAPPER");
        console.log("====================================================");
    }
}
