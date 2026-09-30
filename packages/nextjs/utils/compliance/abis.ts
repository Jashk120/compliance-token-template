export const HTS_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000167" as const;

export const complianceTokenAbi = [
  { type: "function", name: "tokenAddress", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "HTS", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "creationFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "COMPLIANCE_OFFICER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  { type: "function", name: "SALE_OPERATOR_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    type: "function",
    name: "grantKyc",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeKyc",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "freeze",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "unfreeze",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  { type: "function", name: "pause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "unpause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "event",
    name: "KycGranted",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AccountFrozen",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "HtsCallFailed", inputs: [{ name: "responseCode", type: "int64" }] },
  {
    type: "error",
    name: "AccessControlUnauthorizedAccount",
    inputs: [
      { name: "account", type: "address" },
      { name: "neededRole", type: "bytes32" },
    ],
  },
  { type: "error", name: "TokenAlreadyCreated", inputs: [] },
  { type: "error", name: "TokenNotCreated", inputs: [] },
  { type: "error", name: "InsufficientCreationFee", inputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "error", name: "SupplyExceedsInt64", inputs: [{ type: "uint256" }] },
] as const;

export const tokenSaleAbi = [
  { type: "function", name: "buy", stateMutability: "payable", inputs: [], outputs: [{ type: "int64" }] },
  { type: "function", name: "tokenPriceUsd", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenUnit", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "perInvestorCapUsd", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "usdSpent",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "maxStaleness", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "priceFeed", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "complianceToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "event",
    name: "TokensPurchased",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "tokenAmount", type: "int64", indexed: false },
      { name: "usdValue8", type: "uint256", indexed: false },
      { name: "hbarTinybar", type: "uint256", indexed: false },
      { name: "refundTinybar", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "InvalidPrice", inputs: [{ name: "answer", type: "int256" }] },
  {
    type: "error",
    name: "StalePrice",
    inputs: [
      { name: "updatedAt", type: "uint256" },
      { name: "currentTimestamp", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "IncompleteRound",
    inputs: [
      { name: "roundId", type: "uint80" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "error",
    name: "PerInvestorCapExceeded",
    inputs: [
      { name: "investor", type: "address" },
      { name: "attemptedTotal", type: "uint256" },
      { name: "cap", type: "uint256" },
    ],
  },
  { type: "error", name: "ZeroTokenAmount", inputs: [] },
  { type: "error", name: "AmountExceedsInt64", inputs: [{ type: "uint256" }] },
  { type: "error", name: "RefundFailed", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "KycNotGranted", inputs: [{ name: "responseCode", type: "int64" }] },
  { type: "error", name: "Frozen", inputs: [{ name: "responseCode", type: "int64" }] },
  { type: "error", name: "Paused", inputs: [{ name: "responseCode", type: "int64" }] },
  { type: "error", name: "NotAssociated", inputs: [{ name: "responseCode", type: "int64" }] },
  { type: "error", name: "TransferFailed", inputs: [{ name: "responseCode", type: "int64" }] },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
] as const;

export const htsAbi = [
  {
    type: "function",
    name: "associateToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "responseCode", type: "int64" }],
  },
] as const;

export const aggregatorAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
