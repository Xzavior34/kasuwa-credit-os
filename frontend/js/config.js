// frontend/js/config.js - Contract configurations, ABIs, network presets, and error definitions

export const ABI = {
  passport: [
    "function getCreditCapacity(bytes32) view returns (uint256)",
    "function getCreditTier(bytes32) view returns (uint8)",
    "function getCurrentExposure(bytes32) view returns (uint256)",
    "function getAvailableCredit(bytes32) view returns (uint256)",
    "function getVerifiedEconomicActivity(bytes32) view returns (uint256 eventCount, uint256 paymentVolume)",
    "function getRepaymentHistory(bytes32) view returns (uint256 count, uint256 volume, uint256 streak, uint256 missed)",
    "function getMerchantState(bytes32) view returns (tuple(uint256 verifiedEventCount, uint256 verifiedPaymentVolume, uint256 successfulRepaymentCount, uint256 repaymentVolume, uint256 repaymentStreak, uint256 missedObligations, uint64 lastVerifiedActivity, uint256 currentExposure, uint256 currentCapacity))",
    "event VerifiedEventRecorded(bytes32 indexed merchantId, uint8 eventType, uint256 amount, bytes32 evidenceId)"
  ],
  verifier: [
    "function registeredSourceContracts(uint64,address) view returns (bool)",
    "function evidenceConsumed(bytes32) view returns (bool)",
    "function submitEvidence((uint64 chainKey,uint64 height,bytes encodedTransaction,(bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof,address sourceContract,uint32 logIndex)) returns (bytes32)",
    "event EvidenceVerified(bytes32 indexed evidenceId, uint64 indexed chainKey, address indexed sourceContract, uint64 height, bool sourceTxSuccess)",
    "error NotAdmin()",
    "error SourceContractMismatch()",
    "error EvidenceAlreadyConsumed()",
    "error VerificationFailed()",
    "error SourceTransactionFailed()",
    "error MalformedEncodedTransaction()",
    "error LogIndexOutOfRange()",
    "error UnknownEventSignature()",
    "error SourceContractDidNotEmitThisLog()"
  ],
  policy: [
    "function maxLoanAmount() view returns (uint256)",
    "function maxTenorSeconds() view returns (uint256)",
    "function minCreditTier() view returns (uint8)",
    "function paused() view returns (bool)"
  ],
  creditline: [
    "function borrow(bytes32 merchantId, uint256 requestedAmount, uint256 tenorSeconds, uint256 aiRecommendedAmount)",
    "function repay(bytes32 merchantId) payable",
    "error BorrowRejected(uint8 reason)"
  ],
  econ: [
    "function emitPaymentSettled(bytes32 merchantId, uint256 amount, bytes32 referenceId)",
    "function emitRevenueRecorded(bytes32 merchantId, uint256 amount, bytes32 referenceId)",
    "function emitLoanRepayment(bytes32 merchantId, uint256 amount, bytes32 referenceId)",
    "function emitObligationMissed(bytes32 merchantId, uint256 amount, bytes32 referenceId)"
  ],
  pool: [
    "function deposit() payable",
    "function totalLiquidity() view returns (uint256)"
  ]
};

export const EVENT_SIGNATURES = [
  ethers.id("PaymentSettled(bytes32,address,uint256,bytes32,uint64)"),
  ethers.id("RevenueRecorded(bytes32,address,uint256,bytes32,uint64)"),
  ethers.id("LoanRepayment(bytes32,address,uint256,bytes32,uint64)"),
  ethers.id("ObligationMissed(bytes32,address,uint256,bytes32,uint64)")
];

export const EVENT_TYPE_NAMES = [
  "PaymentSettled",
  "RevenueRecorded",
  "LoanRepayment",
  "ObligationMissed"
];

export const REJECTION_REASON_NAMES = [
  "NONE",
  "PROTOCOL_PAUSED",
  "POLICY_LIMIT_EXCEEDED",
  "TENOR_LIMIT_EXCEEDED",
  "EXPOSURE_LIMIT_EXCEEDED",
  "BELOW_MIN_TIER",
  "INSUFFICIENT_CREDIT_CAPACITY",
  "INSUFFICIENT_LIQUIDITY"
];

export const NETWORK_PRESETS = {
  local: {
    id: "local",
    name: "LOCAL ANVIL — DEMO ENVIRONMENT",
    shortName: "LOCAL ANVIL",
    chainId: 31337,
    chainIdHex: "0x7a69",
    rpc: "http://127.0.0.1:8545",
    sourceChainKey: 2,
    blockExplorer: null,
    isConfigured: true,
    statusText: "Deterministic Local Testing Environment",
    contracts: {
      creditPassport: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
      attestcoinVerifier: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      creditEngine: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      policyEngine: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
      creditLine: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
      economicEvents: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
      liquidityPool: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
      mockBlockProver: "0x5FbDB2315678afecb367f032d93F642f64180aa3"
    }
  },
  cc3: {
    id: "cc3",
    name: "CREDITCOIN CC3 — TESTNET",
    shortName: "CC3 TESTNET",
    chainId: 102031,
    chainIdHex: "0x18e8f",
    rpc: "https://rpc.cc3-testnet.creditcoin.network",
    sourceChainKey: 1,
    blockExplorer: "https://creditcoin-testnet.blockscout.com",
    isConfigured: true,
    statusText: "Live Attestcoin/USC Testnet",
    contracts: {
      creditPassport: "0x9DbaD85c6eBFA90fD4634deE08020Bb95a80942d",
      attestcoinVerifier: "0x8Fd160D9E7617a9C47d6c2824A425DB823cdc1C2",
      creditEngine: "0xcc364e6D87146abBdB47ebaAAe964f7d447E4875",
      policyEngine: "0x30b7A70b4fA0Be2F3eD2ef7551c4890A481Ef047",
      creditLine: "0x3ed53F226dd8f46451E3e5D418b25Be7889fd49e",
      economicEvents: "0x84780ab03db7A3FebFdb789De402314F202D8263",
      liquidityPool: "0xB89E9A2D42BbE6Ffd7Dca9b8f225d4A43C219AF8",
      mockBlockProver: "0x0000000000000000000000000000000000000FD2"
    }
  }
};
