// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {CCIPLocalSimulator} from "@chainlink/local/ccip/CCIPLocalSimulator.sol";
import {
    IRouterClient
} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {WETH9} from "@chainlink/local/shared/WETH9.sol";
import {LinkToken} from "@chainlink/local/shared/LinkToken.sol";
import {
    BurnMintERC677Helper
} from "@chainlink/local/ccip/BurnMintERC677Helper.sol";
import {
    ERC1967Proxy
} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {
    StealthBondFactory
} from "../src/stage2-issuance/StealthBondFactory.sol";
import {
    StealthBondERC3643
} from "../src/stage2-issuance/StealthBondERC3643.sol";
import {
    StealthBondReceiver
} from "../src/stage2-issuance/StealthBondReceiver.sol";
import {
    IPolicyEngine
} from "@chainlink/policy-management/interfaces/IPolicyEngine.sol";

contract MockPolicyEngine {
    function run(IPolicyEngine.Payload calldata payload) external {}
    function attach() external {}
    function detach() external {}
}

contract DeployStealthBond is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy CCIP Local Simulator
        CCIPLocalSimulator ccipLocalSimulator = new CCIPLocalSimulator();

        (
            uint64 chainSelector,
            IRouterClient sourceRouter,
            IRouterClient destRouter,
            WETH9 wrappedNative,
            LinkToken linkToken,
            BurnMintERC677Helper ccipBnM,
            BurnMintERC677Helper ccipLnM
        ) = ccipLocalSimulator.configuration();

        console.log("CCIP Local Simulator deployed.");
        console.log("Source Router:", address(sourceRouter));
        console.log("Dest Router:", address(destRouter));
        console.log("Chain Selector:", chainSelector);
        console.log("LINK Token:", address(linkToken));

        // 2. Deploy Dependencies
        MockPolicyEngine policyEngine = new MockPolicyEngine();
        StealthBondERC3643 tokenImpl = new StealthBondERC3643();

        address creForwarder = address(0x1111);

        console.log("Policy Engine deployed at:", address(policyEngine));
        console.log("Token Implementation deployed at:", address(tokenImpl));

        // 3. Deploy StealthBondFactory (Proxy)
        StealthBondFactory factoryImpl = new StealthBondFactory();

        address deployer = vm.addr(deployerPrivateKey);

        bytes memory initData = abi.encodeWithSelector(
            StealthBondFactory.initialize.selector,
            deployer, // Owner
            address(policyEngine),
            creForwarder,
            address(policyEngine),
            address(tokenImpl),
            address(sourceRouter),
            address(linkToken)
        );

        ERC1967Proxy factoryProxy = new ERC1967Proxy(
            address(factoryImpl),
            initData
        );
        StealthBondFactory factory = StealthBondFactory(address(factoryProxy));
        console.log("StealthBondFactory Proxy deployed at:", address(factory));

        // 4. Deploy Receiver
        StealthBondReceiver receiver = new StealthBondReceiver(
            address(destRouter),
            address(factory)
        );
        console.log("StealthBondReceiver deployed at:", address(receiver));

        // Fund Factory with LINK
        ccipLocalSimulator.requestLinkFromFaucet(address(factory), 100 ether);
        console.log("Funded Factory with 100 LINK.");

        vm.stopBroadcast();
    }
}
