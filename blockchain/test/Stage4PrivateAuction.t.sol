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

// Mock USDC
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { _mint(msg.sender, 1000000 * 10**6); }
    function decimals() public pure override returns (uint8) { return 6; }
}

contract Stage4PrivateAuctionTest is Test {
    StealthVaultEscrow public escrow;
    StealthBondERC3643 public rwaToken;
    MockUSDC public usdc;
    MockComplianceIssuer public complianceIssuer;

    address public deployer = address(0x1);
    uint256 public creSignerPK = 0x1234; // El DON Signer de nuestro Workflow CRE
    address public creSigner;
    
    address public seller = address(0x10);
    address public winner = address(0x11);
    address public loser = address(0x12);

    function setUp() public {
        creSigner = vm.addr(creSignerPK);
        vm.startPrank(deployer);

        complianceIssuer = new MockComplianceIssuer();
        complianceIssuer.setVerified(seller, true);
        complianceIssuer.setVerified(winner, true);
        complianceIssuer.setVerified(loser, true);

        // Desplegar infraestructura ACE
        PolicyEngine policyEngine = new PolicyEngine();
        bytes memory peData = abi.encodeWithSelector(PolicyEngine.initialize.selector, true, deployer);
        address peProxy = address(new ERC1967Proxy(address(policyEngine), peData));
        
        usdc = new MockUSDC();

        // Desplegar Vault (Nueva Fase 4)
        StealthVaultEscrow escrowImpl = new StealthVaultEscrow();
        escrow = StealthVaultEscrow(address(new ERC1967Proxy(address(escrowImpl), abi.encodeWithSelector(
            StealthVaultEscrow.initialize.selector, deployer, peProxy, creSigner, address(complianceIssuer)
        ))));

        // Desplegar RWA Token (Stage 2)
        address rwaImpl = address(new StealthBondERC3643());
        rwaToken = StealthBondERC3643(address(new ERC1967Proxy(rwaImpl, abi.encodeWithSelector(
            StealthBondERC3643.initializeStealthBond.selector, "Bono RWA", "RWA", 6, peProxy, deployer, keccak256("m")
        ))));
        rwaToken.updateReserveRatio(10000);

        escrow.registerToken(address(rwaToken), peProxy);
        escrow.registerToken(address(usdc), address(0));

        // Fondear actores
        rwaToken.issueRwaFractions(seller, 100 * 10**6);
        usdc.transfer(winner, 5000 * 10**6);
        usdc.transfer(loser, 5000 * 10**6);

        vm.stopPrank();
    }

    /**
     * @notice TEST INTEGRAL: Simula el Flujo de Transacciones Privadas (Shielding -> Resolving -> Unshielding)
     * Este test valida que el Smart Contract y la lógica del TEE (CRE) están perfectamente sincronizados.
     */
    function test_EndToEnd_PrivateAuction() public {
        // --- PASO 1: SHIELDING (Público on-chain) ---
        // Vendedor pone bonos en el Vault
        vm.prank(seller);
        rwaToken.approve(address(escrow), 100 * 10**6);
        vm.prank(seller);
        escrow.deposit(address(rwaToken), 100 * 10**6);

        // Postores ponen USDC en el Vault (sin decir cuánto pujarán)
        vm.startPrank(winner);
        usdc.approve(address(escrow), 2000 * 10**6);
        escrow.deposit(address(usdc), 2000 * 10**6);
        vm.stopPrank();

        vm.startPrank(loser);
        usdc.approve(address(escrow), 1500 * 10**6);
        escrow.deposit(address(usdc), 1500 * 10**6);
        vm.stopPrank();

        // --- PASO 2: LOGICA DEL TEE (Simulada en Test, ejecutada en CRE Workflow) ---
        // El TEE decide: Ganador es `winner` con puja de 1800 USDC.
        uint256 finalPrice = 1800 * 10**6;
        uint256 rwaAmount = 100 * 10**6;

        // Generar Tickets firmados por el CRE Signer
        bytes memory winnerTicket = _generateTicket(winner, address(rwaToken), rwaAmount);
        bytes memory sellerTicket = _generateTicket(seller, address(usdc), finalPrice);
        bytes memory changeTicket = _generateTicket(winner, address(usdc), 200 * 10**6); // Cambio (2000 - 1800)
        bytes memory refundTicket = _generateTicket(loser, address(usdc), 1500 * 10**6); // Reembolso total

        // --- PASO 3: UNSHIELDING (Ejecutado por cada usuario con su ticket) ---
        
        // El Ganador reclama sus Bonos
        vm.prank(winner);
        escrow.withdrawWithTicket(address(rwaToken), rwaAmount, winnerTicket);
        assertEq(rwaToken.balanceOf(winner), rwaAmount, "Ganador no recibio bonos");

        // El Vendedor reclama su Pago (USDC)
        vm.prank(seller);
        escrow.withdrawWithTicket(address(usdc), finalPrice, sellerTicket);
        assertEq(usdc.balanceOf(seller), finalPrice, "Vendedor no recibio pago");

        // El Ganador reclama su Cambio
        vm.prank(winner);
        escrow.withdrawWithTicket(address(usdc), 200 * 10**6, changeTicket);
        assertEq(usdc.balanceOf(winner), 3000 * 10**6 + 200 * 10**6, "Ganador no recibio cambio");

        // El Perdedor reclama su Reembolso
        vm.prank(loser);
        escrow.withdrawWithTicket(address(usdc), 1500 * 10**6, refundTicket);
        assertEq(usdc.balanceOf(loser), 5000 * 10**6, "Perdedor no recupero sus fondos");

        // Verificación de Vault limpio
        assertEq(usdc.balanceOf(address(escrow)), 0, "Quedaron USDC atrapados en el Vault");
        assertEq(rwaToken.balanceOf(address(escrow)), 0, "Quedaron RWA atrapados en el Vault");
    }

    // Función auxiliar para firmar tickets (Lo que hace el CRE Workflow)
    function _generateTicket(address recipient, address token, uint256 amount) internal view returns (bytes memory) {
        bytes32 ticketHash = keccak256(abi.encode(recipient, token, amount, address(escrow)));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(ticketHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(creSignerPK, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }
}
