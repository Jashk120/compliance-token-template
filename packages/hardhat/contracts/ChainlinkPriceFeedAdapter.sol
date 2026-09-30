// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IPriceFeed } from "./interfaces/IPriceFeed.sol";

/// @notice Minimal subset of the Chainlink AggregatorV3 interface.
/// @dev Declared locally so the template does not depend on `@chainlink/contracts`.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title ChainlinkPriceFeedAdapter
/// @notice Thin {IPriceFeed} adapter around a Chainlink AggregatorV3 proxy.
/// @dev The adapter exists so {TokenSale} can depend on the small {IPriceFeed}
///      surface and swap or mock the feed without changing sale logic. Deploy one
///      adapter per aggregator.
///
///      Hedera HBAR/USD proxies (8 decimals, 24h heartbeat):
///      - testnet (296): 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a
///      - mainnet (295): 0xAF685FB45C12b92b5054ccb9313e135525F9b5d5
///      Source: https://docs.chain.link/data-feeds/price-feeds/addresses?network=hedera
contract ChainlinkPriceFeedAdapter is IPriceFeed {
    /// @notice Underlying aggregator (usually a Chainlink proxy).
    AggregatorV3Interface public immutable aggregator;

    /// @param aggregator_ Address of the AggregatorV3-compatible contract.
    constructor(address aggregator_) {
        require(aggregator_ != address(0), "ChainlinkPriceFeedAdapter: zero aggregator");
        aggregator = AggregatorV3Interface(aggregator_);
    }

    /// @inheritdoc IPriceFeed
    function decimals() external view returns (uint8) {
        return aggregator.decimals();
    }

    /// @inheritdoc IPriceFeed
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return aggregator.latestRoundData();
    }
}
