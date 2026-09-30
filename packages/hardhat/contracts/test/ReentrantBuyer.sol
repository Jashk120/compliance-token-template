// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { TokenSale } from "../TokenSale.sol";

/// @title ReentrantBuyer
/// @notice Test helper that attempts to re-enter {TokenSale.buy} from the dust refund.
contract ReentrantBuyer {
    TokenSale public immutable sale;
    bool private _reentering;

    constructor(TokenSale sale_) {
        sale = sale_;
    }

    /// @notice Calls `buy`; the dust refund triggers {receive}, which re-enters.
    function attack() external payable {
        sale.buy{ value: msg.value }();
    }

    /// @notice Re-enters `buy` when the refund arrives.
    receive() external payable {
        if (!_reentering) {
            _reentering = true;
            sale.buy{ value: 0 }();
        }
    }
}
