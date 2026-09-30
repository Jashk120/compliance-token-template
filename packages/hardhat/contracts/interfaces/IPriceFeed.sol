// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPriceFeed
/// @notice Minimal Chainlink-compatible price-feed reader used by {TokenSale}.
/// @dev Keeping this interface separate from any concrete aggregator lets the sale
///      contract swap feed implementations (real Chainlink proxy, a local mock, or a
///      different oracle) without changing sale logic. See `ChainlinkPriceFeedAdapter`.
interface IPriceFeed {
    /// @notice Number of decimals in the value returned by {latestRoundData}.
    function decimals() external view returns (uint8);

    /// @notice Latest round data.
    /// @return roundId The round identifier.
    /// @return answer The price, scaled by {decimals}.
    /// @return startedAt Round start timestamp.
    /// @return updatedAt Round update timestamp (0 means the round is incomplete).
    /// @return answeredInRound Round the answer was computed in.
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
