import { JsonRpcProvider } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { PermanentError } from "./retry.js";
import { logger } from "./logger.js";

/**
 * Thin wrapper around @gluwa/usc-sdk's real proof-generation components. We do not reimplement
 * any part of the proof system — every call below delegates to the SDK (v0.18.0, verified
 * against the published npm package; see docs/NETWORKS.md).
 */

export function makeChainInfoProvider(creditcoinRpcUrl: string): chainInfo.PrecompileChainInfoProvider {
  const rpc = new JsonRpcProvider(creditcoinRpcUrl);
  // Cast needed due to a known TS "dual package hazard": the ethers types re-exported through
  // @gluwa/usc-sdk's own type declarations are structurally identical to, but nominally
  // distinct from, the ethers types resolved directly by this package under NodeNext module
  // resolution. This is a type-checker-only quirk (both resolve to the same physical ethers
  // package/version at runtime) — not a functional bug. See ethers-io/ethers.js#4675 and
  // similar reports for the general pattern.
  return new chainInfo.PrecompileChainInfoProvider(rpc as unknown as ConstructorParameters<typeof chainInfo.PrecompileChainInfoProvider>[0]);
}

/**
 * Blocks until the given source-chain height is attested on Creditcoin, i.e. until a proof for
 * a transaction at that height can actually be built and verified. See SDK docs: proving before
 * attestation will simply fail, so this wait is not optional polish — it is required for
 * correctness.
 */
export async function waitForAttestation(
  provider: chainInfo.PrecompileChainInfoProvider,
  sourceChainKey: number,
  sourceHeight: number,
): Promise<void> {
  await provider.waitUntilHeightAttested(sourceChainKey, sourceHeight);
}

export async function buildProof(
  sourceChainKey: number,
  creditcoinProofBuilderUrl: string,
  sourceTxHash: string,
): Promise<proofProvider.ContinuityResponse> {
  const builder = new proofProvider.service.ProofBuilder(sourceChainKey, creditcoinProofBuilderUrl);
  const result: proofProvider.ProofResult = await builder.getProof(sourceTxHash);

  if (!result.success || !result.data) {
    logger.warn("proof generation failed", { sourceTxHash, errorCode: "PROOF_FAILED" });
    // The proof-builder service returning success:false for a malformed/unprovable transaction
    // is not something retrying will fix — treat as permanent.
    throw new PermanentError(result.error ?? "proof builder returned no data", "PROOF_FAILED");
  }

  return result.data;
}
