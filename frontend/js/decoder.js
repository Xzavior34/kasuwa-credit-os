// frontend/js/decoder.js - Centralized Solidity error decoding & security explanations

import { REJECTION_REASON_NAMES } from './config.js';

export const KNOWN_ERROR_SELECTORS = {
  "0xae5c42ee": "EvidenceAlreadyConsumed",
  "0x6e9f1345": "SourceContractMismatch",
  "0xd1ec97f1": "SourceContractDidNotEmitThisLog",
  "0xc60cdba1": "SourceTransactionFailed",
  "0x5e791244": "UnknownEventSignature",
  "0xa3d7d745": "LogIndexOutOfRange",
  "0x393ebc25": "MalformedEncodedTransaction",
  "0x8baa579f": "VerificationFailed",
  "0x7939f424": "NotAdmin",
  "0x3777de94": "BorrowRejected"
};

export const ERROR_EXPLANATIONS = {
  "EvidenceAlreadyConsumed": {
    title: "Replay Attack Blocked",
    selector: "0xae5c42ee",
    description: "This cryptographic evidence has already been consumed and recorded in the protocol replay registry. Evidence cannot be submitted more than once.",
    securityMeaning: "Prevents double-spending of historical economic volume to artificially inflate credit capacity.",
    authority: "AttestcoinVerifier.sol (evidenceConsumed mapping)"
  },
  "SourceContractMismatch": {
    title: "Unregistered Source Contract Blocked",
    selector: "0x6e9f1345",
    description: "The source contract address is not on the protocol's allowlist registry for this source chain key.",
    securityMeaning: "Prevents rogue contracts or unvetted payment gateways from feeding forged data into credit passports.",
    authority: "AttestcoinVerifier.sol (registeredSourceContracts mapping)"
  },
  "SourceContractDidNotEmitThisLog": {
    title: "Source Contract Log Emitter Mismatch Blocked",
    selector: "0xd1ec97f1",
    description: "The receipt log emitter address does not match the allowlisted source contract specified in the submission parameters.",
    securityMeaning: "Prevents relayers from attributing logs from arbitrary unverified contracts to allowlisted contracts.",
    authority: "TransactionEvidence.sol (Log Decoupling Guard)"
  },
  "SourceTransactionFailed": {
    title: "Reverted Source Transaction Blocked",
    selector: "0xc60cdba1",
    description: "The source transaction on the external settlement chain reverted (EIP-658 receipt status = 0).",
    securityMeaning: "Prevents failed or cancelled transactions from falsely registering as successful economic volume.",
    authority: "TransactionEvidence.sol (Receipt Status Guard)"
  },
  "UnknownEventSignature": {
    title: "Unrecognized Event Signature Blocked",
    selector: "0x5e791244",
    description: "The event log topic does not match any registered Kasuwa economic event signature.",
    securityMeaning: "Ensures only recognized, validated economic events (PaymentSettled, RevenueRecorded, LoanRepayment, ObligationMissed) can update credit state.",
    authority: "TransactionEvidence.sol (Topic Decoupler)"
  },
  "LogIndexOutOfRange": {
    title: "Log Index Out of Bounds Blocked",
    selector: "0xa3d7d745",
    description: "The requested log index exceeds the number of receipt logs present in the verified transaction receipt.",
    securityMeaning: "Guarantees strict array bounds checking against maliciously crafted log index pointers.",
    authority: "TransactionEvidence.sol (Bounds Checker)"
  },
  "MalformedEncodedTransaction": {
    title: "Malformed Encoded Transaction Blocked",
    selector: "0x393ebc25",
    description: "The transaction chunk encoding fails strict RLP or USC tuple formatting standards.",
    securityMeaning: "Prevents garbage or corrupt byte payloads from being processed by on-chain decoders.",
    authority: "TransactionEvidence.sol (Chunk Decoder)"
  },
  "BorrowRejected(POLICY_LIMIT_EXCEEDED)": {
    title: "On-Chain Policy Limit Exceeded",
    selector: "0x3777de94",
    description: "The requested borrow amount exceeds the deterministic maximum loan limit set in PolicyEngine.sol ($2,000 cap).",
    securityMeaning: "Demonstrates that off-chain AI recommendations cannot override deterministic on-chain smart contract policy.",
    authority: "PolicyEngine.sol (maxLoanAmount limit)"
  },
  "BorrowRejected(INSUFFICIENT_CREDIT_CAPACITY)": {
    title: "Insufficient Credit Capacity",
    selector: "0x3777de94",
    description: "The requested borrow amount exceeds the merchant's currently available credit capacity in CreditPassport.sol.",
    securityMeaning: "Ensures loans are strictly backed by verified historical economic capacity.",
    authority: "CreditPassport.sol (getCreditCapacity)"
  },
  "BorrowRejected(INSUFFICIENT_LIQUIDITY)": {
    title: "Insufficient Pool Liquidity",
    selector: "0x3777de94",
    description: "The requested amount exceeds the active unreserved liquidity available in LiquidityPool.sol.",
    securityMeaning: "Protects pool solvency against under-collateralized or over-leveraged drawdowns.",
    authority: "LiquidityPool.sol (totalLiquidity)"
  },
  "BorrowRejected(TENOR_LIMIT_EXCEEDED)": {
    title: "Tenor Limit Exceeded",
    selector: "0x3777de94",
    description: "The requested repayment duration exceeds the maximum tenor allowed by PolicyEngine.sol.",
    securityMeaning: "Caps duration risk and enforces regular loan turnover cycles.",
    authority: "PolicyEngine.sol (maxTenorSeconds)"
  },
  "BorrowRejected(BELOW_MIN_TIER)": {
    title: "Below Minimum Credit Tier",
    selector: "0x3777de94",
    description: "The merchant's assigned tier is lower than the minimum required by PolicyEngine.sol.",
    securityMeaning: "Restricts credit line access to merchants with sufficient verified economic history.",
    authority: "PolicyEngine.sol (minCreditTier)"
  }
};

/**
 * Decode a revert error from an RPC call or transaction failure
 */
export function decodeContractError(err, interfaces = []) {
  const data = err.data || err.info?.error?.data || err.error?.data || err.payload?.data;
  
  if (typeof data === 'string' && data.length >= 10) {
    const selector = data.slice(0, 10).toLowerCase();
    
    // Check known selector mapping first
    if (selector === "0x3777de94") {
      // BorrowRejected(uint8)
      try {
        const reasonCode = parseInt(data.slice(10, 74), 16);
        const reasonName = REJECTION_REASON_NAMES[reasonCode] || `REASON_${reasonCode}`;
        const key = `BorrowRejected(${reasonName})`;
        const defaultInfo = {
          title: `Borrow Rejected (${reasonName})`,
          selector: "0x3777de94",
          description: `The borrow request was rejected on-chain by PolicyEngine with code ${reasonCode}.`,
          securityMeaning: "Deterministic policy enforcement blocked this transaction on-chain.",
          authority: "PolicyEngine.sol / CreditLine.sol"
        };
        return {
          name: key,
          selector,
          explanation: ERROR_EXPLANATIONS[key] || defaultInfo
        };
      } catch (_) {}
    }

    if (KNOWN_ERROR_SELECTORS[selector]) {
      const name = KNOWN_ERROR_SELECTORS[selector];
      return {
        name,
        selector,
        explanation: ERROR_EXPLANATIONS[name] || {
          title: name,
          selector,
          description: "Transaction was rejected by on-chain contract validation rules.",
          securityMeaning: "On-chain invariant protection.",
          authority: "Kasuwa Smart Contracts"
        }
      };
    }

    // Try parsing with provided ethers interfaces
    for (const iface of interfaces) {
      try {
        const parsed = iface.parseError(data);
        if (parsed) {
          if (parsed.name === "BorrowRejected") {
            const code = Number(parsed.args[0]);
            const reasonName = REJECTION_REASON_NAMES[code] || code;
            const key = `BorrowRejected(${reasonName})`;
            return {
              name: key,
              selector,
              explanation: ERROR_EXPLANATIONS[key] || {
                title: `Borrow Rejected (${reasonName})`,
                selector,
                description: `Rejected on-chain with code ${code}.`,
                securityMeaning: "Deterministic policy enforcement.",
                authority: "PolicyEngine.sol"
              }
            };
          }
          return {
            name: parsed.name,
            selector,
            explanation: ERROR_EXPLANATIONS[parsed.name] || {
              title: parsed.name,
              selector,
              description: "Transaction was rejected by contract custom error.",
              securityMeaning: "Smart contract security invariant.",
              authority: "Kasuwa Smart Contracts"
            }
          };
        }
      } catch (_) {}
    }
  }

  // Fallback for user cancellations or standard RPC messages
  const msg = err.shortMessage || err.reason || err.message || String(err);
  if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
    return {
      name: "UserRejectedAction",
      selector: "0x00000000",
      explanation: {
        title: "Transaction Cancelled in Wallet",
        selector: "N/A",
        description: "The transaction signature was cancelled or rejected by the user in the wallet.",
        securityMeaning: "User initiated cancellation.",
        authority: "User Wallet"
      }
    };
  }

  return {
    name: "UnknownRevert",
    selector: "N/A",
    explanation: {
      title: "Transaction Reverted",
      selector: "N/A",
      description: msg,
      securityMeaning: "EVM execution revert.",
      authority: "EVM Execution Engine"
    }
  };
}
