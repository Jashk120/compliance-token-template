// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title CallerProbe
/// @notice Test helper that records its caller, used by the live proof to confirm the
///         msg.sender the EVM sees when the Hedera SDK operator calls a contract.
contract CallerProbe {
    event Recorded(address indexed caller);

    function record() external {
        emit Recorded(msg.sender);
    }
}
