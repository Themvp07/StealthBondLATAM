// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockForwarder (Hackathon CRE Shim)
 * @notice Redirects calls from the CRE simulator to the correct recipient contract.
 */
contract MockForwarder {
    function report(
        address receiver,
        bytes calldata metadata,
        bytes calldata reportPayload,
        bytes[] calldata /* signatures */
    ) external {
        // Redirect to AgentRegistry using the standard IReceiver signature
        (bool success, ) = receiver.call(
            abi.encodeWithSignature(
                "onReport(bytes,bytes)",
                metadata,
                reportPayload
            )
        );

        if (!success) {
            // If it fails, we try a variant in case the receiver only accepts the payload
            (success, ) = receiver.call(
                abi.encodeWithSignature("onReport(bytes)", reportPayload)
            );
        }

        require(success, "MockForwarder: Call to receiver failed");
    }

    // Selector 0x11289565
    fallback() external {
        // We could handle unknown selectors here
    }
}
