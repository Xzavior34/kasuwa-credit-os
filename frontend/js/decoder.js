// frontend/js/decoder.js - Centralized Solidity error decoding

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
    description: "This cryptographic evidence has already been consumed and recorded in the protocol registry. Evidence cannot be submitted more than once.",
    authority: "AttestcoinVerifier.sol (Replay Registry)"
  },
  "SourceContractMismatch": {
    title: "Unregistered Source Contract",
    description: "The source contract address is not on the protocol's verified source registry for this chain key.",
    authority: "AttestcoinVerifier.sol (Allowlist)"
  },
  "SourceContractDidNotEmitThisLog": {
    title: "Source Contract Log Emitter Mismatch",
    description: "The emitted log's address does not match the allowlisted source contract parameter.",
    authority: "TransactionEvidence.sol (Log Decoupling Guard)"
  },
  "SourceTransactionFailed": {
    title: "Reverted Source Transaction",
    description: "The source transaction on the external chain reverted (EIP-658 receipt status = 0). Reverted transactions cannot generate credit capacity.",
    authority: "TransactionEvidence.sol (Receipt Status Guard)"
  },
  "UnknownEventSignature": {
    title: "Unrecognized Event Signature",
    description: "The event log topic does not match any recognized Kasuwa economic event signatures (PaymentSettled, RevenueRecorded, LoanRepayment, ObligationMissed).",
    authority: "TransactionEvidence.sol (Topic Decoupler)"
  },
  "LogIndexOutOfRange": {
    title: "Log Index Out of Bounds",
    description: "The requested log index exceeds the number of receipt logs in the verified transaction receipt.",
    authority: "TransactionEvidence.sol (Bounds Checker)"
  },
  "MalformedEncodedTransaction": {
    title: "Malformed Encoded Transaction",
    description: "The transaction chunk encoding fails strict RLP or USC tuple formatting standards.",
    authority: "TransactionEvidence.sol (Decoder)"
  },
  "BorrowRejected(POLICY_LIMIT_EXCEEDED)": {
    title: "On-Chain Policy Limit Exceeded",
    description: "The requested borrow amount exceeds the deterministic maximum loan amount set by PolicyEngine.sol ($2,000 cap). AI recommendations cannot override smart contract policy.",
    authority: "PolicyEngine.sol"
  },
  "BorrowRejected(INSUFFICIENT_CREDIT_CAPACITY)": {
    title: "Insufficient Credit Capacity",
    description: "The requested borrow amount exceeds the merchant's currently available credit capacity in CreditPassport.sol.",
    authority: "CreditPassport.sol"
  },
  "BorrowRejected(INSUFFICIENT_LIQUIDITY)": {
    title: "Insufficient Pool Liquidity",
    description: "The requested amount exceeds the active unreserved liquidity in LiquidityPool.sol.",
    authority: "LiquidityPool.sol"
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
        return {
          name: key,
          selector,
          explanation: ERROR_EXPLANATIONS[key] || {
            title: `Borrow Rejected (${reasonName})`,
            description: `The borrow request was rejected on-chain with code ${reasonCode}.`,
            authority: "PolicyEngine.sol / CreditLine.sol"
          }
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
          description: "Transaction was rejected by contract control rules.",
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
                description: `Rejected on-chain with code ${code}.`,
                authority: "PolicyEngine.sol"
              }
            };
          }
          return {
            name: parsed.name,
            selector,
            explanation: ERROR_EXPLANATIONS[parsed.name] || {
              title: parsed.name,
              description: "Transaction was rejected by contract custom error.",
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
        title: "Transaction Cancelled",
        description: "The transaction signature was rejected or cancelled in your wallet.",
        authority: "User Wallet"
      }
    };
  }

  return {
    name: "UnknownRevert",
    selector: "N/A",
    explanation: {
      title: "Transaction Reverted",
      description: msg,
      authority: "EVM Execution Engine"
    }
  };
}
