// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract KeystoneForwarder {
    address public donSigner;
    address public targetRegistry;
    address public deployer; 

    function name() external pure returns (bytes32) { return "StealthBond Forwarder"; }
    function symbol() external pure returns (bytes32) { return "SBF"; }

    constructor(address _donSigner, address _targetRegistry) {
        donSigner = _donSigner;
        targetRegistry = _targetRegistry;
        deployer = msg.sender;
    }

    function report(address, bytes calldata metadata, bytes calldata reportPayload, bytes[] calldata) external {
        (bool success, ) = targetRegistry.call(
            abi.encodeWithSignature("onReport(bytes,bytes)", metadata, reportPayload)
        );
        require(success, "KeystoneForwarder: Forwarded call failed");
    }

    function setTargetRegistry(address _newRegistry) external {
        require(msg.sender == deployer || msg.sender == donSigner, "Only Deployer or DON can update");
        targetRegistry = _newRegistry;
    }
}