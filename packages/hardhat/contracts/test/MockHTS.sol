// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaTokenService } from "../interfaces/IHederaTokenService.sol";

/// @title MockHTS
/// @notice Local, stateful stand-in for the Hedera Token Service precompile at `0x167`.
/// @dev Hardhat cannot etch a bytecode implementation onto the `0x167` precompile
///      address the way Foundry can with `vm.etch`, so the template injects this
///      address into {ComplianceToken} (and {TokenSale} via the token contract)
///      through a constructor/setter — the same technique the `tokenize-subscriptions`
///      template uses. Deploy this mock and pass its address as `htsAddress`.
///
///      Behaviour modelled:
///      - token keys are stored per token; only the key's `contractId` may mutate the
///        compliance state it guards (KYC / FREEZE / PAUSE). Any other caller gets
///        `INVALID_SIGNATURE`.
///      - per-account association / KYC / frozen state, a paused flag, and real
///        fungible balances.
///      - methods return HTS response CODES rather than reverting.
///      - `transferToken` checks in the order paused -> frozen -> KYC -> association
///        and enforces that the caller is the sender.
///      - `associateToken` returns `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT` on repeat.
contract MockHTS is IHederaTokenService {
    /// @notice HTS success code.
    int64 public constant SUCCESS = 22;
    /// @notice Returned when a caller is not authorised by the relevant token key.
    /// @dev Illustrative code for the mock (Hedera `INVALID_SIGNATURE`); the tests
    ///      only rely on it being non-success.
    int64 public constant INVALID_SIGNATURE = 7;
    /// @notice Returned when an account has not been granted KYC.
    int64 public constant ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN = 176;
    /// @notice Returned when an account is frozen for the token.
    int64 public constant ACCOUNT_FROZEN_FOR_TOKEN = 165;
    /// @notice Returned when the token is paused.
    int64 public constant TOKEN_IS_PAUSED = 265;
    /// @notice Returned when an account is not associated with the token.
    int64 public constant TOKEN_NOT_ASSOCIATED_TO_ACCOUNT = 184;
    /// @notice Returned when an account is already associated with the token.
    int64 public constant TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT = 194;
    /// @notice Returned when the token does not exist.
    int64 public constant TOKEN_NOT_FOUND = 185;
    /// @notice Returned when the sender's balance is insufficient.
    int64 public constant INSUFFICIENT_TOKEN_BALANCE = 181;

    uint256 public constant KYC_KEY_TYPE = 2;
    uint256 public constant FREEZE_KEY_TYPE = 4;
    uint256 public constant PAUSE_KEY_TYPE = 64;

    struct TokenData {
        bool exists;
        string name;
        string symbol;
        address treasury;
        int64 totalSupply;
        int32 decimals;
        bool paused;
    }

    mapping(address token => TokenData) private _tokens;
    mapping(address token => mapping(uint256 keyType => address controller)) private _keyControllers;
    mapping(address token => mapping(address account => bool)) private _associated;
    mapping(address token => mapping(address account => bool)) private _kyc;
    mapping(address token => mapping(address account => bool)) private _frozen;
    mapping(address token => mapping(address account => int64)) private _balances;

    uint256 private _tokenCounter;

    /// @notice When set to a value other than -1, `createFungibleToken` returns it and
    ///         no token is created (used to exercise the precompile failure path).
    int64 public forcedCreateResponseCode = -1;

    event MockTokenCreated(address indexed token, address indexed treasury, int64 initialSupply);

    /// @notice Forces (or clears, with -1) a canned response code for token creation.
    function setForcedCreateResponseCode(int64 code) external {
        forcedCreateResponseCode = code;
    }

    /// @inheritdoc IHederaTokenService
    function createFungibleToken(
        HederaToken memory token,
        int64 initialTotalSupply,
        int32 decimals
    ) external payable override returns (int64 responseCode, address tokenAddress) {
        if (forcedCreateResponseCode != -1) {
            return (forcedCreateResponseCode, address(0));
        }

        _tokenCounter++;
        tokenAddress = address(uint160(0x1000 + _tokenCounter));

        _tokens[tokenAddress] = TokenData({
            exists: true,
            name: token.name,
            symbol: token.symbol,
            treasury: token.treasury,
            totalSupply: initialTotalSupply,
            decimals: decimals,
            paused: false
        });

        for (uint256 i = 0; i < token.tokenKeys.length; i++) {
            _keyControllers[tokenAddress][token.tokenKeys[i].keyType] = token.tokenKeys[i].key.contractId;
        }

        // The treasury is implicitly associated and holds the initial supply.
        _associated[tokenAddress][token.treasury] = true;
        _balances[tokenAddress][token.treasury] = initialTotalSupply;

        emit MockTokenCreated(tokenAddress, token.treasury, initialTotalSupply);
        return (SUCCESS, tokenAddress);
    }

    /// @inheritdoc IHederaTokenService
    function grantTokenKyc(address token, address account) external override returns (int64) {
        if (!_tokens[token].exists) return TOKEN_NOT_FOUND;
        if (_keyControllers[token][KYC_KEY_TYPE] != msg.sender) return INVALID_SIGNATURE;
        if (!_associated[token][account]) return TOKEN_NOT_ASSOCIATED_TO_ACCOUNT;
        _kyc[token][account] = true;
        return SUCCESS;
    }

    /// @inheritdoc IHederaTokenService
    function revokeTokenKyc(address token, address account) external override returns (int64) {
        if (!_tokens[token].exists) return TOKEN_NOT_FOUND;
        if (_keyControllers[token][KYC_KEY_TYPE] != msg.sender) return INVALID_SIGNATURE;
        if (!_associated[token][account]) return TOKEN_NOT_ASSOCIATED_TO_ACCOUNT;
        _kyc[token][account] = false;
        return SUCCESS;
    }

    /// @inheritdoc IHederaTokenService
    function freezeToken(address token, address account) external override returns (int64) {
        if (!_tokens[token].exists) return TOKEN_NOT_FOUND;
        if (_keyControllers[token][FREEZE_KEY_TYPE] != msg.sender) return INVALID_SIGNATURE;
        _frozen[token][account] = true;
        return SUCCESS;
    }

    /// @inheritdoc IHederaTokenService
    function unfreezeToken(address token, address account) external override returns (int64) {
        if (!_tokens[token].exists) return TOKEN_NOT_FOUND;
        if (_keyControllers[token][FREEZE_KEY_TYPE] != msg.sender) return INVALID_SIGNATURE;
        _frozen[token][account] = false;
        return SUCCESS;
    }

    /// @inheritdoc IHederaTokenService
    function pauseToken(address token) external override returns (int64) {
        if (!_tokens[token].exists) return TOKEN_NOT_FOUND;
        if (_keyControllers[token][PAUSE_KEY_TYPE] != msg.sender) return INVALID_SIGNATURE;
        _tokens[token].paused = true;
        return SUCCESS;
    }

    /// @inheritdoc IHederaTokenService
    function unpauseToken(address token) external override returns (int64) {
        if (!_tokens[token].exists) return TOKEN_NOT_FOUND;
        if (_keyControllers[token][PAUSE_KEY_TYPE] != msg.sender) return INVALID_SIGNATURE;
        _tokens[token].paused = false;
        return SUCCESS;
    }

    /// @inheritdoc IHederaTokenService
    function associateToken(address account, address token) external override returns (int64) {
        if (!_tokens[token].exists) return TOKEN_NOT_FOUND;
        if (_associated[token][account]) return TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT;
        _associated[token][account] = true;
        return SUCCESS;
    }

    /// @inheritdoc IHederaTokenService
    /// @dev Check order: paused -> frozen -> KYC -> association.
    function transferToken(
        address token,
        address sender,
        address receiver,
        int64 amount
    ) external override returns (int64) {
        TokenData storage tokenData = _tokens[token];
        if (!tokenData.exists) return TOKEN_NOT_FOUND;
        if (msg.sender != sender) return INVALID_SIGNATURE;
        if (tokenData.paused) return TOKEN_IS_PAUSED;
        if (_frozen[token][sender] || _frozen[token][receiver]) return ACCOUNT_FROZEN_FOR_TOKEN;
        if (!_kyc[token][sender] || !_kyc[token][receiver]) return ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN;
        if (!_associated[token][sender] || !_associated[token][receiver]) return TOKEN_NOT_ASSOCIATED_TO_ACCOUNT;
        if (_balances[token][sender] < amount) return INSUFFICIENT_TOKEN_BALANCE;

        _balances[token][sender] -= amount;
        _balances[token][receiver] += amount;
        return SUCCESS;
    }

    // --- Test helpers -------------------------------------------------------

    /// @notice Balance of `account` for `token`.
    function balanceOf(address token, address account) external view returns (int64) {
        return _balances[token][account];
    }

    /// @notice Whether `account` is associated with `token`.
    function isAssociated(address token, address account) external view returns (bool) {
        return _associated[token][account];
    }

    /// @notice Whether `account` has KYC for `token`.
    function isKycGranted(address token, address account) external view returns (bool) {
        return _kyc[token][account];
    }

    /// @notice Whether `account` is frozen for `token`.
    function isFrozen(address token, address account) external view returns (bool) {
        return _frozen[token][account];
    }

    /// @notice Whether `token` is paused.
    function isPaused(address token) external view returns (bool) {
        return _tokens[token].paused;
    }

    /// @notice Controller address for a token key type.
    function keyController(address token, uint256 keyType) external view returns (address) {
        return _keyControllers[token][keyType];
    }

    /// @notice Current total supply for `token`.
    function totalSupply(address token) external view returns (int64) {
        return _tokens[token].totalSupply;
    }

    /// @notice Treasury address for `token`.
    function treasuryOf(address token) external view returns (address) {
        return _tokens[token].treasury;
    }
}
