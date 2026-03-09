// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {StealthVaultEscrow} from "../src/stage4-market/StealthVaultEscrow.sol";
import {StealthBondERC3643} from "../src/stage2-issuance/StealthBondERC3643.sol";
import {PolicyEngine} from "@chainlink/policy-management/core/PolicyEngine.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// Mock del ComplianceIssuer de la Fase 1
contract MockComplianceIssuer {
    mapping(address => bool) public verified;
    function setVerified(address user, bool status) external { verified[user] = status; }
    function isVerified(address wallet, uint256) external view returns (bool) { return verified[wallet]; }
}

// Mock USDC para pruebas
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 1000000 * 10**6);
    }
    function decimals() public pure override returns (uint8) { return 6; }
}

contract StealthVaultEscrowTest is Test {
    StealthVaultEscrow public escrow;
    StealthBondERC3643 public rwaToken;
    MockUSDC public usdc;
    PolicyEngine public policyEngine;
    MockComplianceIssuer public complianceIssuer;

    address public deployer = address(0x1);
    uint256 public creSignerPK = 0x1234;
    address public creSigner;
    
    address public user = address(0x3);
    address public unverifiedUser = address(0x4);

    function setUp() public {
        creSigner = vm.addr(creSignerPK);
        vm.startPrank(deployer);

        complianceIssuer = new MockComplianceIssuer();
        complianceIssuer.setVerified(user, true); // Solo 'user' esta verificado

        // 1. Desplegar PolicyEngine
        PolicyEngine policyEngineImpl = new PolicyEngine();
        bytes memory policyEngineData = abi.encodeWithSelector(
            PolicyEngine.initialize.selector,
            true, // defaultAllow = true
            deployer
        );
        policyEngine = PolicyEngine(address(new ERC1967Proxy(address(policyEngineImpl), policyEngineData)));
        usdc = new MockUSDC();

        StealthVaultEscrow escrowImpl = new StealthVaultEscrow();
        escrow = StealthVaultEscrow(address(new ERC1967Proxy(address(escrowImpl), abi.encodeWithSelector(
            StealthVaultEscrow.initialize.selector, deployer, address(policyEngine), creSigner, address(complianceIssuer)
        ))));

        // RWA setup
        rwaToken = StealthBondERC3643(address(new ERC1967Proxy(address(new StealthBondERC3643()), abi.encodeWithSelector(
            StealthBondERC3643.initializeStealthBond.selector, "Bono", "B", 6, address(policyEngine), deployer, keccak256("m")
        ))));
        rwaToken.updateReserveRatio(10000);

        escrow.registerToken(address(rwaToken), address(policyEngine));
        escrow.registerToken(address(usdc), address(0));

        rwaToken.issueRwaFractions(user, 1000 * 10**6);
        usdc.transfer(user, 5000 * 10**6);
        usdc.transfer(unverifiedUser, 1000 * 10**6);

        vm.stopPrank();
    }

    function test_CCID_Validation_On_Deposit() public {
        // 1. Usuario Verificado -> OK
        vm.startPrank(user);
        usdc.approve(address(escrow), 100 * 10**6);
        escrow.deposit(address(usdc), 100 * 10**6);
        assertEq(usdc.balanceOf(address(escrow)), 100 * 10**6);
        vm.stopPrank();

        // 2. Usuario NO Verificado -> FAIL
        vm.startPrank(unverifiedUser);
        usdc.approve(address(escrow), 100 * 10**6);
        vm.expectRevert("StealthVault: Participant must have a valid CCID (Phase 1 Identity missing)");
        escrow.deposit(address(usdc), 100 * 10**6);
        vm.stopPrank();
    }

    function test_CCID_Validation_On_Withdraw() public {
        // Enviar fondos al vault manualmente para el test de retiro
        deal(address(usdc), address(escrow), 1000 * 10**6);

        // Ticket para unverifiedUser (TEE podria darselo, pero contrato veta la salida)
        uint256 amount = 500 * 10**6;
        bytes32 ticketHash = keccak256(abi.encode(unverifiedUser, address(usdc), amount, address(escrow)));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(ticketHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(creSignerPK, ethSignedHash);
        bytes memory ticket = abi.encodePacked(r, s, v);

        vm.prank(unverifiedUser);
        vm.expectRevert("StealthVault: Participant must have a valid CCID (Phase 1 Identity missing)");
        escrow.withdrawWithTicket(address(usdc), amount, ticket);
    }
}
