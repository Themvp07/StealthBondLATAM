// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {CCIPLocalSimulator} from "@chainlink/local/ccip/CCIPLocalSimulator.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {WETH9} from "@chainlink/local/shared/WETH9.sol";
import {LinkToken} from "@chainlink/local/shared/LinkToken.sol";
import {BurnMintERC677Helper} from "@chainlink/local/ccip/BurnMintERC677Helper.sol";

import {StealthBondFactory} from "../../src/stage2-issuance/StealthBondFactory.sol";
import {StealthBondERC3643} from "../../src/stage2-issuance/StealthBondERC3643.sol";
import {StealthBondReceiver} from "../../src/stage2-issuance/StealthBondReceiver.sol";
import {IPolicyEngine} from "@chainlink/policy-management/interfaces/IPolicyEngine.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MockPolicyEngine {
    function run(IPolicyEngine.Payload calldata payload) external {}
    function attach() external {}
    function detach() external {}
}

contract StealthBondFactoryTest is Test {
    CCIPLocalSimulator public ccipLocalSimulator;
    StealthBondFactory public factory;
    StealthBondReceiver public receiver;
    StealthBondERC3643 public tokenImpl;
    MockPolicyEngine public policyEngine;
    
    uint64 public chainSelector;
    IRouterClient public sourceRouter;
    IRouterClient public destRouter;
    WETH9 public wrappedNative;
    LinkToken public linkToken;
    BurnMintERC677Helper public ccipBnM;
    BurnMintERC677Helper public ccipLnM;

    address public creForwarder = address(0x1111);
    address public issuer = address(0x2222);

    function setUp() public {
        ccipLocalSimulator = new CCIPLocalSimulator();
        
        (
            chainSelector,
            sourceRouter,
            destRouter,
            wrappedNative,
            linkToken,
            ccipBnM,
            ccipLnM
        ) = ccipLocalSimulator.configuration();

        policyEngine = new MockPolicyEngine();
        tokenImpl = new StealthBondERC3643();

        StealthBondFactory factoryImpl = new StealthBondFactory();
        
        // Encode initialize call
        bytes memory initData = abi.encodeWithSelector(
            StealthBondFactory.initialize.selector,
            address(this),
            address(policyEngine),
            creForwarder,
            address(policyEngine),
            address(tokenImpl),
            address(sourceRouter),
            address(linkToken)
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(factoryImpl), initData);
        factory = StealthBondFactory(address(proxy));

        receiver = new StealthBondReceiver(address(destRouter), address(factory));

        // Fund factory with LINK so it can pay for CCIP messages
        ccipLocalSimulator.requestLinkFromFaucet(address(factory), 100 ether);
    }

    function testIssueBondAndCCIPSend() public {
        uint256 nominalValue = 100_000 * 10**6; // 100k USD
        bytes32 cipherHash = keccak256("test-hash");
        
        uint256 bondId = factory.issueBond(
            nominalValue,
            cipherHash,
            issuer,
            "Arbitrum Sepolia",
            chainSelector
        );

        assertEq(bondId, 1, "Bond ID should be 1");
        
        (
            uint256 id,
            uint256 totalNominalValue,
            bytes32 hash,
            address issuerWallet,
            address tokenContract,
            string memory network
        ) = factory.manifests(bondId);

        assertEq(id, bondId);
        assertEq(totalNominalValue, nominalValue);
        assertEq(hash, cipherHash);
        assertEq(issuerWallet, issuer);
        assertEq(network, "Arbitrum Sepolia");

        // Validate token status
        StealthBondERC3643 rwa = StealthBondERC3643(tokenContract);
        assertEq(rwa.balanceOf(issuer), nominalValue);
        assertTrue(rwa.paused(), "Token must be paused initially");
        
        console.log("Successfully issued bond and triggered CCIP send!");
        console.log("Deployed RWA Token Proxy:", tokenContract);
    }
}
