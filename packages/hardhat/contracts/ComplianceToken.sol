// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

import { IHederaTokenService } from "./interfaces/IHederaTokenService.sol";

/// @title ComplianceToken
/// @notice Creates one Hedera Token Service (HTS) fungible token whose compliance
///         keys are bound to this contract, and exposes role-gated KYC, freeze and
///         pause controls over it.
/// @dev Design (see docs/architecture.md):
///      - The token is created through the HTS precompile; `treasury` is
///        `address(this)` and the ADMIN, KYC, FREEZE, SUPPLY and PAUSE keys are
///        `contractId` keys pointing at `address(this)`. Because a contractId key
///        authorises the contract that makes the precompile call (no proxy), only
///        this contract can mutate the token's compliance state.
///      - This mirrors the official Hedera tutorial, which sets `treasury` and keys
///        to `address(this)` and grants KYC to the treasury after creation:
///        https://docs.hedera.com/evm/tutorials/hedera/hts-evm/part2-kyc-update
///      - The contract that holds the treasury is therefore the only contract that
///        can move the token supply. {saleTransfer} lets an authorised sale
///        operator ask this contract to transfer from the treasury, so the treasury
///        holder (this contract) is always the caller of `transferToken`.
contract ComplianceToken is AccessControl {
    /// @notice Role allowed to grant/revoke KYC, freeze/unfreeze and pause/unpause.
    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");
    /// @notice Role allowed to request treasury transfers during a sale.
    bytes32 public constant SALE_OPERATOR_ROLE = keccak256("SALE_OPERATOR_ROLE");

    /// @notice Default Hedera Token Service precompile address.
    address public constant DEFAULT_HTS = 0x0000000000000000000000000000000000000167;

    /// @notice HTS response code for success.
    int64 public constant SUCCESS = 22;

    /// @dev HTS key-type bit values (see KeyHelper.sol in hiero-contracts).
    uint256 public constant ADMIN_KEY_TYPE = 1;
    uint256 public constant KYC_KEY_TYPE = 2;
    uint256 public constant FREEZE_KEY_TYPE = 4;
    uint256 public constant SUPPLY_KEY_TYPE = 16;
    uint256 public constant PAUSE_KEY_TYPE = 64;

    /// @notice Maximum value representable by HTS `int64` supply/amount fields.
    uint256 public constant MAX_INT64 = uint256(uint64(type(int64).max));

    /// @notice Configured HTS address (allows mock injection in tests).
    address public immutable HTS;

    /// @notice Address of the created HTS token, or zero before creation.
    address public tokenAddress;

    /// @notice HBAR (in 8-decimal tinybar, the unit of Hedera's EVM `msg.value`)
    ///         forwarded to the precompile for one token creation. The precompile does not refund
    ///         surplus value, so callers must send at least this and the contract
    ///         refunds the remainder. Admin-settable because network fees change.
    uint256 public creationFee;

    /// @notice Emitted when the HTS token is created.
    event TokenCreated(address indexed token, string name, string symbol, uint256 initialSupply, uint8 decimals);
    /// @notice Emitted when KYC is granted to an account.
    event KycGranted(address indexed account, address indexed operator, uint256 timestamp);
    /// @notice Emitted when KYC is revoked from an account.
    event KycRevoked(address indexed account, address indexed operator, uint256 timestamp);
    /// @notice Emitted when an account is frozen.
    event AccountFrozen(address indexed account, address indexed operator, uint256 timestamp);
    /// @notice Emitted when an account is unfrozen.
    event AccountUnfrozen(address indexed account, address indexed operator, uint256 timestamp);
    /// @notice Emitted when the token is paused.
    event TokenPaused(address indexed operator, uint256 timestamp);
    /// @notice Emitted when the token is unpaused.
    event TokenUnpaused(address indexed operator, uint256 timestamp);
    /// @notice Emitted when the sale operator asks this contract to move treasury tokens.
    event SaleTransfer(address indexed to, int64 amount, int64 responseCode);
    /// @notice Emitted when the creation fee is updated.
    event CreationFeeUpdated(uint256 previousFee, uint256 newFee);

    /// @notice Thrown when token creation is attempted more than once.
    error TokenAlreadyCreated();
    /// @notice Thrown when an operation requires a token that does not exist yet.
    error TokenNotCreated();
    /// @notice Thrown when `msg.value` is below {creationFee}.
    error InsufficientCreationFee(uint256 provided, uint256 required);
    /// @notice Thrown when a supply value does not fit HTS `int64`.
    error SupplyExceedsInt64(uint256 supply);
    /// @notice Thrown when a sale transfer amount is not positive.
    error InvalidAmount();
    /// @notice Thrown when an HTS precompile call returns a non-success code.
    error HtsCallFailed(int64 responseCode);
    /// @notice Thrown when a refund to the caller fails.
    error RefundFailed();
    /// @notice Thrown when a zero address is supplied where it is not allowed.
    error ZeroAddress();

    /// @param initialAdmin Account granted DEFAULT_ADMIN_ROLE and COMPLIANCE_OFFICER_ROLE.
    /// @param htsAddress HTS precompile address; `address(0)` selects {DEFAULT_HTS}.
    /// @param creationFee_ HBAR (tinybar, 8 decimals) forwarded per token creation.
    constructor(address initialAdmin, address htsAddress, uint256 creationFee_) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, initialAdmin);
        HTS = htsAddress == address(0) ? DEFAULT_HTS : htsAddress;
        creationFee = creationFee_;
    }

    /// @notice Updates the HBAR amount forwarded to the precompile per creation.
    /// @dev DEFAULT_ADMIN_ROLE only; no other owner powers exist.
    function setCreationFee(uint256 newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit CreationFeeUpdated(creationFee, newFee);
        creationFee = newFee;
    }

    /// @notice Creates the HTS fungible token once.
    /// @dev Forwards exactly {creationFee} to the precompile and refunds the rest of
    ///      `msg.value` to the caller. HIP-358 requires the precompile TokenCreate fee
    ///      (the HAPI fee plus a 20% premium) to be sent as value; the precompile does
    ///      not refund surplus, so the contract forwards only {creationFee}.
    ///      Reverts when `initialSupply` exceeds HTS `int64`.
    /// @param name Token name.
    /// @param symbol Token symbol.
    /// @param decimals Token decimals.
    /// @param initialSupply Initial supply in base units.
    /// @return created Address of the created token.
    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 initialSupply
    ) external payable onlyRole(DEFAULT_ADMIN_ROLE) returns (address created) {
        if (tokenAddress != address(0)) revert TokenAlreadyCreated();
        if (initialSupply > MAX_INT64) revert SupplyExceedsInt64(initialSupply);
        if (msg.value < creationFee) revert InsufficientCreationFee(msg.value, creationFee);

        IHederaTokenService.HederaToken memory token = IHederaTokenService.HederaToken({
            name: name,
            symbol: symbol,
            treasury: address(this),
            memo: "",
            tokenSupplyType: false,
            maxSupply: 0,
            freezeDefault: false,
            tokenKeys: _complianceKeys(),
            expiry: IHederaTokenService.Expiry({ second: 0, autoRenewAccount: address(this), autoRenewPeriod: 7890000 })
        });

        (int64 responseCode, address createdToken) = IHederaTokenService(HTS).createFungibleToken{ value: creationFee }(
            token,
            int64(uint64(initialSupply)),
            int32(uint32(decimals))
        );
        if (responseCode != SUCCESS) revert HtsCallFailed(responseCode);
        tokenAddress = createdToken;

        uint256 refund = msg.value - creationFee;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{ value: refund }("");
            if (!ok) revert RefundFailed();
        }

        // A KYC-enforced token requires the treasury to be KYC-granted before it can
        // hold or move tokens. The official tutorial does exactly this for a
        // contract-held treasury: grantTokenKyc(token, address(this)).
        int64 kycCode = IHederaTokenService(HTS).grantTokenKyc(createdToken, address(this));
        if (kycCode != SUCCESS) revert HtsCallFailed(kycCode);

        emit TokenCreated(createdToken, name, symbol, initialSupply, decimals);
        return createdToken;
    }

    /// @notice Grants KYC to `account` for the token.
    function grantKyc(address account) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _requireSuccess(IHederaTokenService(HTS).grantTokenKyc(_requireToken(), account));
        emit KycGranted(account, msg.sender, block.timestamp);
    }

    /// @notice Revokes KYC from `account` for the token.
    function revokeKyc(address account) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _requireSuccess(IHederaTokenService(HTS).revokeTokenKyc(_requireToken(), account));
        emit KycRevoked(account, msg.sender, block.timestamp);
    }

    /// @notice Freezes `account` for the token.
    function freeze(address account) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _requireSuccess(IHederaTokenService(HTS).freezeToken(_requireToken(), account));
        emit AccountFrozen(account, msg.sender, block.timestamp);
    }

    /// @notice Unfreezes `account` for the token.
    function unfreeze(address account) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _requireSuccess(IHederaTokenService(HTS).unfreezeToken(_requireToken(), account));
        emit AccountUnfrozen(account, msg.sender, block.timestamp);
    }

    /// @notice Pauses all token operations.
    function pause() external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _requireSuccess(IHederaTokenService(HTS).pauseToken(_requireToken()));
        emit TokenPaused(msg.sender, block.timestamp);
    }

    /// @notice Resumes token operations.
    function unpause() external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _requireSuccess(IHederaTokenService(HTS).unpauseToken(_requireToken()));
        emit TokenUnpaused(msg.sender, block.timestamp);
    }

    /// @notice Transfers `amount` of the treasury-held token to `to`.
    /// @dev SALE_OPERATOR_ROLE only. Returns the raw HTS response code instead of
    ///      reverting so the caller ({TokenSale}) can map it to a specific error.
    /// @param to Recipient account.
    /// @param amount Amount in base units.
    /// @return responseCode HTS response code (`22` on success).
    function saleTransfer(address to, int64 amount) external onlyRole(SALE_OPERATOR_ROLE) returns (int64 responseCode) {
        if (amount <= 0) revert InvalidAmount();
        responseCode = IHederaTokenService(HTS).transferToken(_requireToken(), address(this), to, amount);
        emit SaleTransfer(to, amount, responseCode);
    }

    /// @dev Builds the ADMIN, KYC, FREEZE, SUPPLY and PAUSE keys, all bound to this
    ///      contract. The ADMIN key is required: HTS rejects a create whose token has
    ///      no admin key, and it also lets the token's keys be rotated later.
    function _complianceKeys() internal view returns (IHederaTokenService.TokenKey[] memory keys) {
        keys = new IHederaTokenService.TokenKey[](5);
        keys[0] = _contractKey(ADMIN_KEY_TYPE);
        keys[1] = _contractKey(KYC_KEY_TYPE);
        keys[2] = _contractKey(FREEZE_KEY_TYPE);
        keys[3] = _contractKey(SUPPLY_KEY_TYPE);
        keys[4] = _contractKey(PAUSE_KEY_TYPE);
    }

    /// @dev A single key whose `contractId` is this contract (strict, no proxy).
    function _contractKey(uint256 keyType) internal view returns (IHederaTokenService.TokenKey memory) {
        return
            IHederaTokenService.TokenKey({
                keyType: keyType,
                key: IHederaTokenService.KeyValue({
                    inheritAccountKey: false,
                    contractId: address(this),
                    ed25519: "",
                    ECDSA_secp256k1: "",
                    delegatableContractId: address(0)
                })
            });
    }

    /// @dev Returns the token address or reverts if not yet created.
    function _requireToken() internal view returns (address) {
        address token = tokenAddress;
        if (token == address(0)) revert TokenNotCreated();
        return token;
    }

    /// @dev Reverts with the response code when a precompile call did not succeed.
    function _requireSuccess(int64 responseCode) internal pure {
        if (responseCode != 22) revert HtsCallFailed(responseCode);
    }
}
