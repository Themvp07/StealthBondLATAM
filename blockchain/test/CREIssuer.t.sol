// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {CREComplianceIssuer} from "../src/stage1-identity/CREComplianceIssuer.sol";
import {PolicyEngine} from "@chainlink/policy-management/core/PolicyEngine.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IdentityRegistry} from "@chainlink/cross-chain-identity/IdentityRegistry.sol";
import {CredentialRegistry} from "@chainlink/cross-chain-identity/CredentialRegistry.sol";

contract CREIssuerTest is Test {
    PolicyEngine public policyEngine;
    CREComplianceIssuer public issuer;
    IdentityRegistry public identityRegistry;
    CredentialRegistry public credentialRegistry;
    address public deployer = address(0x1);
    address public creOraculo = address(0x2);
    address public testWallet = address(0x3);

    event ComplianceOnChainStored(bytes32 indexed ccid, address indexed wallet, bytes32 credentialTypeId);

    function setUp() public {
        vm.startPrank(deployer);

        // 1. Desplegar PolicyEngine con un Proxy (obligatorio para arquitectura ACE)
        PolicyEngine policyEngineImpl = new PolicyEngine();
        bytes memory policyEngineData = abi.encodeWithSelector(
            PolicyEngine.initialize.selector,
            true, // defaultAllow = true (Dejar pasar si no hay politicas que bloqueen)
            deployer
        );
        ERC1967Proxy policyEngineProxy = new ERC1967Proxy(address(policyEngineImpl), policyEngineData);
        policyEngine = PolicyEngine(address(policyEngineProxy));

        // 2. Desplegar IdentityRegistry
        IdentityRegistry identityImpl = new IdentityRegistry();
        bytes memory identityData = abi.encodeWithSelector(
            IdentityRegistry.initialize.selector,
            address(policyEngine),
            deployer
        );
        identityRegistry = IdentityRegistry(address(new ERC1967Proxy(address(identityImpl), identityData)));

        // 3. Desplegar CredentialRegistry
        CredentialRegistry credentialImpl = new CredentialRegistry();
        bytes memory credentialData = abi.encodeWithSelector(
            CredentialRegistry.initialize.selector,
            address(policyEngine),
            deployer
        );
        credentialRegistry = CredentialRegistry(address(new ERC1967Proxy(address(credentialImpl), credentialData)));

        // 4. Desplegar CREComplianceIssuer con un Proxy
        CREComplianceIssuer issuerImpl = new CREComplianceIssuer();
        bytes memory issuerData = abi.encodeWithSelector(
            CREComplianceIssuer.initialize.selector,
            deployer,
            address(policyEngine),
            creOraculo, // Asignamos creOraculo como el forwarder/issuer
            address(identityRegistry),
            address(credentialRegistry)
        );
        ERC1967Proxy issuerProxy = new ERC1967Proxy(address(issuerImpl), issuerData);
        issuer = CREComplianceIssuer(address(issuerProxy));

        vm.stopPrank();
    }

    function test_Initialization() public {
        // Verificar que el Namespaced Storage funcionó y el forwarder se configuró correctamente.
        assertEq(issuer.getForwarder(), creOraculo, "El CRE Forwarder no coincide");
    }

    function test_OnReport_ReceivesData() public {
        // En este test simularemos lo que hace CRE en TypeScript

        // CCID Dummy
        bytes32 ccid = keccak256("DUMMY_CCID_COMPANY");
        // Credencial: VENEZUELA_KYB_LEI_PASSED
        bytes32 credentialType = keccak256("VENEZUELA_KYB_LEI_PASSED");
        uint40 expiration = uint40(block.timestamp + 365 days);

        // Simulamos la codificación del payload que el CRE Node hará
        bytes memory reportPayload = abi.encode(ccid, testWallet, credentialType, expiration);
        bytes memory metadata = new bytes(0); // Vacio por ahora

        // Vamos a simular que la transacción la envía el nodo CRE autorizado
        vm.startPrank(creOraculo);

        // Esperamos que se emita el evento correcto cuando se procese el reporte
        vm.expectEmit(true, true, false, true);
        emit ComplianceOnChainStored(ccid, testWallet, credentialType);

        // Llamamos a la función protegida por runPolicy
        issuer.onReport(metadata, reportPayload);

        vm.stopPrank();
        
        console.log("SUCCESS: Payload reportado. Variables decodificadas y logradas emitir bajo proteccion PolicyEngine = true");
    }
}
