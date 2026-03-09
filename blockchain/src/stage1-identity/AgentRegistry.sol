// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AgentRegistry {
    enum EntityType {
        NONE,
        PERSON,
        COMPANY,
        AI_AGENT
    }
    struct Identity {
        EntityType entityType;
        bytes32 ccid;
        address tutor;
        uint256 level;
        bool active;
    }

    mapping(address => Identity) public registry;
    address public immutable forwarder;

    // We use bytes32 to avoid Anvil's dynamic strings bug
    function name() external pure returns (bytes32) {
        return "StealthBond Registry";
    }
    function symbol() external pure returns (bytes32) {
        return "SBAR";
    }

    event IdentityRegistered(
        address indexed wallet,
        EntityType entityType,
        bytes32 ccid
    );

    constructor(address _forwarder) {
        forwarder = _forwarder;
    }

    function onReport(bytes calldata, bytes calldata payload) external {
        (address w, uint8 t, bytes32 c, address tu, uint256 l) = abi.decode(
            payload,
            (address, uint8, bytes32, address, uint256)
        );
        registry[w] = Identity(EntityType(t), c, tu, l, true);
        emit IdentityRegistered(w, EntityType(t), c);
    }

    function isVerified(
        address wallet,
        uint256 minLevel
    ) external view returns (bool) {
        return registry[wallet].active && registry[wallet].level >= minLevel;
    }
}
