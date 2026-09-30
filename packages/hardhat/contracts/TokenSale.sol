// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { ComplianceToken } from "./ComplianceToken.sol";
import { IPriceFeed } from "./interfaces/IPriceFeed.sol";

/// @title TokenSale
/// @notice Sells a {ComplianceToken}'s treasury supply for HBAR at a fixed USD
///         price per token, using a Chainlink HBAR/USD feed and a per-investor USD
///         cap.
/// @dev The sale does NOT pre-check KYC or freeze status in Solidity. It asks the
///      token contract (the treasury holder) to move tokens and surfaces the HTS
///      response code as a typed error, so on-chain enforcement stays authoritative.
///      See docs/architecture.md for the treasury/key design.
contract TokenSale is Ownable, ReentrancyGuard {
    /// @notice Decimals used for all USD amounts in this contract.
    uint8 public constant USD_DECIMALS = 8;
    /// @notice `msg.value` (and thus HBAR held by this EVM contract) uses 18 decimals.
    /// @dev Hedera exposes native HBAR to the EVM with 18 decimals ("weibar"), while
    ///      the ledger itself uses 8 decimals (tinybar): 1 HBAR = 1e18 weibar = 1e8
    ///      tinybar, so 1 tinybar = 1e10 weibar. Source:
    ///      https://docs.hedera.com/evm/differences/hbar-decimals
    uint256 public constant WEIBAR_PER_HBAR = 1e18;
    /// @notice Minimum accepted oracle staleness window.
    uint256 public constant MIN_STALENESS = 5 minutes;
    /// @notice Maximum accepted oracle staleness window.
    uint256 public constant MAX_STALENESS = 7 days;
    /// @notice HTS response code for success.
    int64 public constant SUCCESS = 22;
    /// @notice Maximum value representable by HTS `int64` amounts.
    uint256 public constant MAX_INT64 = uint256(uint64(type(int64).max));

    /// @dev HTS response codes surfaced by {buy}.
    int64 private constant ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN = 176;
    int64 private constant ACCOUNT_FROZEN_FOR_TOKEN = 165;
    int64 private constant TOKEN_IS_PAUSED = 265;
    int64 private constant TOKEN_NOT_ASSOCIATED_TO_ACCOUNT = 184;

    /// @notice Token contract that holds the HTS treasury.
    ComplianceToken public immutable complianceToken;
    /// @notice Price feed adapter (swappable by the owner).
    IPriceFeed public priceFeed;
    /// @notice Fixed sale price in USD (8 decimals) per whole token.
    uint256 public immutable tokenPriceUsd;
    /// @notice Base units per whole token (`10 ** tokenDecimals`).
    uint256 public immutable tokenUnit;
    /// @notice Cumulative USD (8 decimals) an investor may spend.
    uint256 public immutable perInvestorCapUsd;
    /// @notice Maximum age in seconds of an oracle answer before {buy} reverts.
    uint256 public maxStaleness;

    /// @notice Cumulative USD (8 decimals) each investor has spent.
    mapping(address investor => uint256 usdSpent) public usdSpent;

    /// @notice Emitted on a successful purchase.
    event TokensPurchased(
        address indexed buyer,
        int64 tokenAmount,
        uint256 usdValue8,
        uint256 hbarWei,
        uint256 refundWei
    );
    /// @notice Emitted when the price feed is swapped.
    event PriceFeedUpdated(address indexed previousFeed, address indexed newFeed);
    /// @notice Emitted when the staleness window changes.
    event MaxStalenessUpdated(uint256 previousValue, uint256 newValue);

    /// @notice Thrown when the oracle answer is non-positive.
    error InvalidPrice(int256 answer);
    /// @notice Thrown when the oracle answer is older than {maxStaleness}.
    error StalePrice(uint256 updatedAt, uint256 currentTimestamp);
    /// @notice Thrown when the oracle round is incomplete (`answeredInRound < roundId`).
    error IncompleteRound(uint80 roundId, uint80 answeredInRound);
    /// @notice Thrown when a purchase would exceed the investor's USD cap.
    error PerInvestorCapExceeded(address investor, uint256 attemptedTotal, uint256 cap);
    /// @notice Thrown when a purchase yields zero tokens.
    error ZeroTokenAmount();
    /// @notice Thrown when a computed token amount does not fit HTS `int64`.
    error AmountExceedsInt64(uint256 amount);
    /// @notice Thrown when the staleness window is outside allowed bounds.
    error StalenessOutOfBounds(uint256 value);
    /// @notice Thrown when `tokenUnit` is zero.
    error InvalidTokenUnit();
    /// @notice Thrown when a refund to the buyer fails.
    error RefundFailed();
    /// @notice Thrown when a zero address is supplied where it is not allowed.
    error ZeroAddress();
    /// @notice Thrown when HTS reports the recipient has no KYC.
    error KycNotGranted(int64 responseCode);
    /// @notice Thrown when HTS reports the recipient is frozen.
    error Frozen(int64 responseCode);
    /// @notice Thrown when HTS reports the token is paused.
    error Paused(int64 responseCode);
    /// @notice Thrown when HTS reports the recipient is not associated.
    error NotAssociated(int64 responseCode);
    /// @notice Thrown when HTS reports any other failure.
    error TransferFailed(int64 responseCode);

    /// @param initialOwner Owner allowed to swap the feed and staleness window.
    /// @param complianceToken_ Token contract that holds the treasury.
    /// @param priceFeed_ Initial price feed adapter.
    /// @param tokenPriceUsd_ Fixed USD (8 decimals) price per whole token.
    /// @param tokenUnit_ Base units per whole token (`10 ** tokenDecimals`).
    /// @param perInvestorCapUsd_ Cumulative USD (8 decimals) cap per investor.
    /// @param maxStaleness_ Oracle staleness window in seconds.
    constructor(
        address initialOwner,
        ComplianceToken complianceToken_,
        IPriceFeed priceFeed_,
        uint256 tokenPriceUsd_,
        uint256 tokenUnit_,
        uint256 perInvestorCapUsd_,
        uint256 maxStaleness_
    ) Ownable(initialOwner) {
        if (address(complianceToken_) == address(0) || address(priceFeed_) == address(0)) revert ZeroAddress();
        if (tokenUnit_ == 0) revert InvalidTokenUnit();
        if (maxStaleness_ < MIN_STALENESS || maxStaleness_ > MAX_STALENESS) revert StalenessOutOfBounds(maxStaleness_);
        complianceToken = complianceToken_;
        priceFeed = priceFeed_;
        tokenPriceUsd = tokenPriceUsd_;
        tokenUnit = tokenUnit_;
        perInvestorCapUsd = perInvestorCapUsd_;
        maxStaleness = maxStaleness_;
    }

    /// @notice Buys as many token base units as `msg.value` affords.
    /// @dev Converts HBAR to USD using the oracle, checks the per-investor cap,
    ///      transfers tokens from the treasury via the token contract, and refunds
    ///      unconvertible "dust" HBAR back to the buyer.
    /// @return tokenAmount Number of token base units purchased.
    function buy() external payable nonReentrant returns (int64 tokenAmount) {
        uint256 price8 = _readPrice();

        uint256 usd8 = _hbarWeiToUsd8(msg.value, price8);
        uint256 tokens = (usd8 * tokenUnit) / tokenPriceUsd;
        if (tokens == 0) revert ZeroTokenAmount();
        if (tokens > MAX_INT64) revert AmountExceedsInt64(tokens);

        uint256 cost8 = (tokens * tokenPriceUsd) / tokenUnit;
        uint256 dustWei = _usd8ToHbarWei(usd8 - cost8, price8);

        uint256 attemptedTotal = usdSpent[msg.sender] + usd8;
        if (attemptedTotal > perInvestorCapUsd) {
            revert PerInvestorCapExceeded(msg.sender, attemptedTotal, perInvestorCapUsd);
        }
        usdSpent[msg.sender] = attemptedTotal;

        tokenAmount = int64(uint64(tokens));
        _surfaceTransferError(complianceToken.saleTransfer(msg.sender, tokenAmount));

        if (dustWei > 0) {
            (bool ok, ) = msg.sender.call{ value: dustWei }("");
            if (!ok) revert RefundFailed();
        }

        emit TokensPurchased(msg.sender, tokenAmount, usd8, msg.value, dustWei);
    }

    /// @notice Swaps the price feed adapter.
    function setPriceFeed(IPriceFeed newFeed) external onlyOwner {
        if (address(newFeed) == address(0)) revert ZeroAddress();
        emit PriceFeedUpdated(address(priceFeed), address(newFeed));
        priceFeed = newFeed;
    }

    /// @notice Updates the oracle staleness window (bounded).
    function setMaxStaleness(uint256 newMaxStaleness) external onlyOwner {
        if (newMaxStaleness < MIN_STALENESS || newMaxStaleness > MAX_STALENESS) {
            revert StalenessOutOfBounds(newMaxStaleness);
        }
        emit MaxStalenessUpdated(maxStaleness, newMaxStaleness);
        maxStaleness = newMaxStaleness;
    }

    /// @notice USD (8 decimals) value of `hbarWei` at `price8` (USD per HBAR, 8 decimals).
    /// @dev Unit derivation. `msg.value` is 18-decimal weibar (1 HBAR = 1e18 weibar).
    ///      A price of `price8` is USD per HBAR scaled by 1e8. Therefore:
    ///        HBAR     = hbarWei / 1e18
    ///        USD      = HBAR * price8 / 1e8
    ///        USD(8dp) = hbarWei / 1e18 * price8 = hbarWei * price8 / 1e18
    ///      Source for the 18-decimal `msg.value`: https://docs.hedera.com/evm/differences/hbar-decimals
    function _hbarWeiToUsd8(uint256 hbarWei, uint256 price8) internal pure returns (uint256) {
        return (hbarWei * price8) / WEIBAR_PER_HBAR;
    }

    /// @notice Inverse of {_hbarWeiToUsd8}: HBAR weibar worth `usd8` at `price8`.
    function _usd8ToHbarWei(uint256 usd8, uint256 price8) internal pure returns (uint256) {
        return (usd8 * WEIBAR_PER_HBAR) / price8;
    }

    /// @dev Reads and validates the latest round, normalising to 8 decimals.
    function _readPrice() internal view returns (uint256 price8) {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();

        if (answer <= 0) revert InvalidPrice(answer);
        if (updatedAt == 0 || block.timestamp - updatedAt > maxStaleness) {
            revert StalePrice(updatedAt, block.timestamp);
        }
        if (answeredInRound < roundId) revert IncompleteRound(roundId, answeredInRound);

        uint8 feedDecimals = priceFeed.decimals();
        int256 scaled;
        if (feedDecimals == USD_DECIMALS) {
            scaled = answer;
        } else if (feedDecimals < USD_DECIMALS) {
            scaled = answer * int256(10 ** (USD_DECIMALS - feedDecimals));
        } else {
            scaled = answer / int256(10 ** (feedDecimals - USD_DECIMALS));
        }
        price8 = uint256(scaled);
    }

    /// @dev Maps an HTS transfer response code to a typed error.
    function _surfaceTransferError(int64 responseCode) internal pure {
        if (responseCode == SUCCESS) return;
        if (responseCode == ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN) revert KycNotGranted(responseCode);
        if (responseCode == ACCOUNT_FROZEN_FOR_TOKEN) revert Frozen(responseCode);
        if (responseCode == TOKEN_IS_PAUSED) revert Paused(responseCode);
        if (responseCode == TOKEN_NOT_ASSOCIATED_TO_ACCOUNT) revert NotAssociated(responseCode);
        revert TransferFailed(responseCode);
    }
}
