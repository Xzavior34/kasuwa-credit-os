import { Contract, JsonRpcProvider, Wallet, TransactionReceipt as CreditcoinReceipt } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";
import { PermanentError } from "./retry.js";
import { logger } from "./logger.js";

/**
 * Minimal ABI slice needed to call AttestcoinVerifier.submitEvidence. Kept hand-written and
 * small rather than importing the full Foundry build artifact, so the relayer package has no
 * build-order dependency on `forge build` having run first. Must stay in sync with
 * src/AttestcoinVerifier.sol.
 *
 * NOTE — this shape changed from an earlier version of this file. `sourceTxHash`,
 * `sourceTxSuccess`, `merchantId`, `eventType`, and `amount` are no longer part of what the
 * relayer submits. AttestcoinVerifier now derives every one of those facts on-chain from
 * `encodedTransaction` itself (see src/lib/TransactionEvidence.sol) — the relayer supplies only
 * structural proof data (which chain/height/log to check and the proof for it), never semantic
 * claims about what happened. See docs/SECURITY_MODEL.md "Relayer honesty".
 */
export const ATTESTCOIN_VERIFIER_ABI = [
  "function submitEvidence((uint64 chainKey,uint64 height,bytes encodedTransaction,(bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof,address sourceContract,uint32 logIndex)) returns (bytes32)",
  "event EvidenceVerified(bytes32 indexed evidenceId,uint64 indexed chainKey,address indexed sourceContract,uint64 height,bool sourceTxSuccess)",
];

export interface EvidenceEnvelope {
  chainKey: number;
  height: number;
  encodedTransaction: string;
  merkleProof: proofProvider.merkle.TransactionMerkleProof;
  continuityProof: proofProvider.ContinuityProof;
  sourceContract: string;
  logIndex: number;
}

export function makeAttestcoinVerifierContract(
  address: string,
  creditcoinRpcUrl: string,
  privateKey: string,
): Contract {
  const provider = new JsonRpcProvider(creditcoinRpcUrl);
  const wallet = new Wallet(privateKey, provider);
  return new Contract(address, ATTESTCOIN_VERIFIER_ABI, wallet);
}

/**
 * Submits one piece of evidence. AttestcoinVerifier enforces every real check on-chain
 * (source-contract allowlist, replay protection via evidenceConsumed, on-chain-derived
 * source-tx-success, and on-chain-derived event content); this function does not — and must
 * not — duplicate or trust-shortcut any of that logic. A revert here (e.g.
 * EvidenceAlreadyConsumed, SourceContractMismatch, SourceTransactionFailed,
 * SourceContractDidNotEmitThisLog, UnknownEventSignature, LogIndexOutOfRange) is the correct,
 * real result of an already-processed, invalid, or mismatched submission — not a relayer bug.
 */
export async function submitEvidence(
  contract: Contract,
  evidence: EvidenceEnvelope,
): Promise<CreditcoinReceipt> {
  try {
    const tx = await contract.submitEvidence([
      evidence.chainKey,
      evidence.height,
      evidence.encodedTransaction,
      [evidence.merkleProof.root, evidence.merkleProof.siblings.map((s) => [s.hash, s.isLeft])],
      [evidence.continuityProof.lowerEndpointDigest, evidence.continuityProof.roots],
      evidence.sourceContract,
      evidence.logIndex,
    ]);
    const receipt: CreditcoinReceipt = await tx.wait();
    logger.info("evidence submitted", { creditcoinTxHash: receipt.hash, sourceContract: evidence.sourceContract });
    return receipt;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("EvidenceAlreadyConsumed")) {
      throw new PermanentError(message, "REPLAYED");
    }
    if (message.includes("SourceContractMismatch") || message.includes("SourceContractDidNotEmitThisLog")) {
      throw new PermanentError(message, "INVALID_SOURCE");
    }
    if (message.includes("SourceTransactionFailed")) {
      throw new PermanentError(message, "SOURCE_FAILED");
    }
    if (message.includes("UnknownEventSignature") || message.includes("LogIndexOutOfRange")) {
      throw new PermanentError(message, "INVALID_SOURCE");
    }
    // Anything else (network blip, nonce race, gas estimation failure) is treated as temporary
    // and left to the caller's retry policy.
    throw err;
  }
}
