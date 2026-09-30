// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MockChainlinkAggregator
/// @notice Settable AggregatorV3-compatible feed for local tests.
/// @dev Every field returned by `latestRoundData` is independently settable so tests
///      can simulate stale answers (`updatedAt`), zero/negative answers, and
///      incomplete rounds (`answeredInRound < roundId`).
contract MockChainlinkAggregator {
    uint8 public decimals;
    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    /// @param decimals_ Feed decimals (Hedera HBAR/USD uses 8).
    /// @param answer_ Initial answer, scaled by `decimals_`.
    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        answer = answer_;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        roundId = 1;
        answeredInRound = 1;
    }

    /// @notice Sets the whole round at once.
    function setRoundData(
        uint80 roundId_,
        int256 answer_,
        uint256 startedAt_,
        uint256 updatedAt_,
        uint80 answeredInRound_
    ) external {
        roundId = roundId_;
        answer = answer_;
        startedAt = startedAt_;
        updatedAt = updatedAt_;
        answeredInRound = answeredInRound_;
    }

    function setDecimals(uint8 decimals_) external {
        decimals = decimals_;
    }

    function setAnswer(int256 answer_) external {
        answer = answer_;
    }

    function setUpdatedAt(uint256 updatedAt_) external {
        updatedAt = updatedAt_;
    }

    /// @notice Convenience: sets `answeredInRound` below `roundId` to mark a round incomplete.
    function setRoundId(uint80 roundId_, uint80 answeredInRound_) external {
        roundId = roundId_;
        answeredInRound = answeredInRound_;
    }

    /// @notice AggregatorV3-compatible read.
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}
