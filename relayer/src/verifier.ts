import { JsonRpcProvider, TransactionReceipt } from "ethers";
import { PermanentError } from "./retry.js";
import { logger } from "./logger.js";

/**
 * Fetches a source-chain transaction receipt and validates SUCCESS, not just INCLUSION.
 *
 * `receipt.status` (from ethers) is the real, standard EIP-658 signal: 1 = the transaction
 * executed successfully, 0 = it reverted but was still included in a block and mined. Treating
 * "has a receipt" as "succeeded" is exactly the bug docs/SECURITY_MODEL.md warns against — see
 * test/failed-source-transaction.t.sol on the contract side for the enforcement of this same
 * invariant once the evidence reaches AttestcoinVerifier.
 */
export async function fetchAndValidateReceipt(
  provider: JsonRpcProvider,
  sourceTxHash: string,
): Promise<TransactionReceipt> {
  const receipt = await provider.getTransactionReceipt(sourceTxHash);
  if (!receipt) {
    throw new PermanentError(`No receipt found for ${sourceTxHash} — was it actually mined?`, "INVALID_SOURCE");
  }
  if (receipt.status !== 1) {
    logger.warn("source transaction included but did not succeed", {
      sourceTxHash,
      status: "SOURCE_FAILED",
    });
    // Not a PermanentError at the SDK layer — the caller decides what to do with this fact.
    // AttestcoinVerifier.submitEvidence is the actual, final enforcement point on-chain.
  }
  return receipt;
}

export function sourceTxSucceeded(receipt: TransactionReceipt): boolean {
  return receipt.status === 1;
}
