// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IHederaTokenService
/// @notice Minimal, hand-written interface for the Hedera Token Service (HTS) system
///         contract at `0x167`, containing only the functions this template calls.
/// @dev This file is NOT copied from the Apache-2.0 `hiero-contracts` /
///      `hedera-smart-contracts` repository. It is written from scratch and only
///      declares the ABI surface we use. Struct field order and value types match
///      the official interface so the precompile decodes the calldata correctly.
///
///      Signatures verified against the official Hedera EVM docs:
///      - HTS system contract overview:
///        https://docs.hedera.com/evm/hedera-services/system-contracts/hts
///      - `transferToken` confirmation URL:
///        https://docs.hedera.com/evm/hedera-services/system-contracts/hts#transfertoken
///        `transferToken(address token, address sender, address receiver, int64 amount)`
///
///      Response code `SUCCESS` is `22`. `createFungibleToken` is `payable`.
interface IHederaTokenService {
    /// @notice Token expiry configuration (not customised by this template).
    struct Expiry {
        int64 second;
        address autoRenewAccount;
        int64 autoRenewPeriod;
    }

    /// @notice A single key value. This template only ever uses `contractId`, which
    ///         binds a key to one contract address with no proxy indirection.
    struct KeyValue {
        bool inheritAccountKey;
        address contractId;
        bytes ed25519;
        bytes ECDSA_secp256k1;
        address delegatableContractId;
    }

    /// @notice A typed token key. `keyType` is a bit value (see key type constants).
    struct TokenKey {
        uint256 keyType;
        KeyValue key;
    }

    /// @notice Full fungible-token definition passed to `createFungibleToken`.
    struct HederaToken {
        string name;
        string symbol;
        address treasury;
        string memo;
        bool tokenSupplyType;
        int64 maxSupply;
        bool freezeDefault;
        TokenKey[] tokenKeys;
        Expiry expiry;
    }

    /// @notice Creates a fungible token. `SUCCESS` is `22`. The call is `payable`;
    ///         unused value is NOT refunded by the precompile, so callers must
    ///         forward only the intended fee and refund any surplus themselves.
    /// @return responseCode HTS response code (`22` on success).
    /// @return tokenAddress Address of the created token.
    function createFungibleToken(
        HederaToken memory token,
        int64 initialTotalSupply,
        int32 decimals
    ) external payable returns (int64 responseCode, address tokenAddress);

    /// @notice Grants KYC to `account` for `token`. Requires the token's KYC key.
    function grantTokenKyc(address token, address account) external returns (int64 responseCode);

    /// @notice Revokes KYC from `account` for `token`. Requires the token's KYC key.
    function revokeTokenKyc(address token, address account) external returns (int64 responseCode);

    /// @notice Freezes `account` for `token`. Requires the token's freeze key.
    function freezeToken(address token, address account) external returns (int64 responseCode);

    /// @notice Unfreezes `account` for `token`. Requires the token's freeze key.
    function unfreezeToken(address token, address account) external returns (int64 responseCode);

    /// @notice Pauses all transfers of `token`. Requires the token's pause key.
    function pauseToken(address token) external returns (int64 responseCode);

    /// @notice Resumes transfers of `token`. Requires the token's pause key.
    function unpauseToken(address token) external returns (int64 responseCode);

    /// @notice Associates `account` with `token` so it can hold a balance.
    /// @dev Idempotency: a repeat association returns
    ///      `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT` (`194`).
    function associateToken(address account, address token) external returns (int64 responseCode);

    /// @notice Transfers `amount` of `token` from `sender` to `receiver`.
    /// @dev The caller must be authorised for `sender` (for a contract-held treasury
    ///      this means the treasury contract itself must make the call).
    ///      The official interface names the third parameter `recipient`; the ABI
    ///      selector (`0xeca36917`) is identical either way.
    function transferToken(
        address token,
        address sender,
        address receiver,
        int64 amount
    ) external returns (int64 responseCode);
}
