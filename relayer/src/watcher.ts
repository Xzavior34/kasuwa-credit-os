import { Contract, JsonRpcProvider, Log } from "ethers";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { getJob, makeJobId, upsertJob } from "./state.js";
import { withRetry, PermanentError } from "./retry.js";
import { fetchAndValidateReceipt } from "./verifier.js";
import { makeChainInfoProvider, waitForAttestation, buildProof } from "./proof-builder.js";
import { makeAttestcoinVerifierContract, submitEvidence } from "./executor.js";
import { startHealthServer } from "./health.js";

/**
 * Minimal source-chain ABI matching src/EconomicEvents.sol — only used here to know which topic0
 * values to watch for. The relayer no longer decodes merchantId/amount/eventType from these logs
 * for submission purposes: AttestcoinVerifier derives all of that on-chain from the proven
 * transaction bytes itself (see src/lib/TransactionEvidence.sol). Watching for these specific
 * event names is purely so the relayer knows WHEN a relevant transaction happened and needs a
 * proof generated — it carries no trust.
 */
const ECONOMIC_EVENTS_ABI = [
  "event PaymentSettled(bytes32 indexed merchantId,address indexed merchant,uint256 amount,bytes32 paymentReference,uint64 timestamp)",
  "event RevenueRecorded(bytes32 indexed merchantId,address indexed merchant,uint256 amount,bytes32 revenueReference,uint64 timestamp)",
  "event LoanRepayment(bytes32 indexed merchantId,address indexed merchant,uint256 amount,bytes32 loanReference,uint64 timestamp)",
  "event ObligationMissed(bytes32 indexed merchantId,address indexed merchant,uint256 amount,bytes32 obligationReference,uint64 timestamp)",
];

const WATCHED_EVENT_NAMES = ["PaymentSettled", "RevenueRecorded", "LoanRepayment", "ObligationMissed"];

async function processLog(config: ReturnType<typeof loadConfig>, log: Log) {
  const jobId = makeJobId(config.sourceChainKey, log.transactionHash, log.index);
  const existing = await getJob(jobId);
  if (existing && ["CREDIT_UPDATED", "REPLAYED"].includes(existing.status)) {
    logger.info("job already terminal, skipping", { jobId, status: existing.status });
    return;
  }

  await upsertJob({
    jobId,
    sourceTxHash: log.transactionHash,
    sourceBlock: log.blockNumber,
    logIndex: log.index,
    chainKey: config.sourceChainKey,
    status: "DETECTED",
    attempt: 0,
  });
  logger.info("job detected", { jobId, sourceTxHash: log.transactionHash, sourceBlock: log.blockNumber });

  await withRetry(
    async (attempt) => {
      await upsertJob({
        jobId,
        sourceTxHash: log.transactionHash,
        sourceBlock: log.blockNumber,
        logIndex: log.index,
        chainKey: config.sourceChainKey,
        status: "SOURCE_CONFIRMED",
        attempt,
      });

      const sourceProvider = new JsonRpcProvider(config.sourceChainRpcUrl);
      const receipt = await fetchAndValidateReceipt(sourceProvider, log.transactionHash);

      // IMPORTANT: `log.index` (from the event listener) is the log's position within the
      // BLOCK, not within this transaction's own receipt. AttestcoinVerifier's on-chain decode
      // indexes into `receipt.logs` (per-TRANSACTION, zero-based) — so we must translate to
      // that here, or the contract will look at the wrong log entirely (and correctly reject
      // it as an unknown-signature or emitter mismatch, since it genuinely is the wrong log).
      const perTxLogIndex = receipt.logs.findIndex((l) => l.index === log.index);
      if (perTxLogIndex === -1) {
        throw new PermanentError(
          `Could not locate log ${log.index} within receipt for ${log.transactionHash}`,
          "INVALID_SOURCE",
        );
      }

      // We no longer branch relayer behavior on receipt.status: AttestcoinVerifier derives
      // sourceTxSuccess itself from the proven bytes and will correctly reject a failed source
      // transaction with SourceTransactionFailed. We still submit it — the on-chain rejection is
      // the demonstrable, auditable result (see docs/DEMO.md "Security Lab").

      await upsertJob({
        jobId,
        sourceTxHash: log.transactionHash,
        sourceBlock: log.blockNumber,
        logIndex: log.index,
        chainKey: config.sourceChainKey,
        status: "WAITING_FOR_ATTESTATION",
        attempt,
      });
      const chainInfoProvider = makeChainInfoProvider(config.creditcoinRpcUrl);
      await waitForAttestation(chainInfoProvider, config.sourceChainKey, log.blockNumber);

      await upsertJob({
        jobId,
        sourceTxHash: log.transactionHash,
        sourceBlock: log.blockNumber,
        logIndex: log.index,
        chainKey: config.sourceChainKey,
        status: "PROOF_GENERATING",
        attempt,
      });
      const proofData = await buildProof(config.sourceChainKey, config.creditcoinProofBuilderUrl, log.transactionHash);

      await upsertJob({
        jobId,
        sourceTxHash: log.transactionHash,
        sourceBlock: log.blockNumber,
        logIndex: log.index,
        chainKey: config.sourceChainKey,
        status: "SUBMITTING",
        attempt,
      });

      const verifierContract = makeAttestcoinVerifierContract(
        config.attestcoinVerifierAddress,
        config.creditcoinRpcUrl,
        config.privateKey,
      );

      try {
        const creditcoinReceipt = await submitEvidence(verifierContract, {
          chainKey: config.sourceChainKey,
          height: proofData.headerNumber,
          encodedTransaction: proofData.txBytes,
          merkleProof: proofData.merkleProof,
          continuityProof: proofData.continuityProof,
          sourceContract: config.economicEventsAddress,
          logIndex: perTxLogIndex,
        });

        await upsertJob({
          jobId,
          sourceTxHash: log.transactionHash,
          sourceBlock: log.blockNumber,
          logIndex: log.index,
          chainKey: config.sourceChainKey,
          status: "CREDIT_UPDATED",
          attempt,
          creditcoinTxHash: creditcoinReceipt.hash,
        });
      } catch (err) {
        if (err instanceof PermanentError && err.errorCode === "REPLAYED") {
          await upsertJob({
            jobId,
            sourceTxHash: log.transactionHash,
            sourceBlock: log.blockNumber,
            logIndex: log.index,
            chainKey: config.sourceChainKey,
            status: "REPLAYED",
            attempt,
            errorCode: err.errorCode,
          });
          return; // terminal, not an error worth propagating further
        }
        throw err;
      }
    },
    { maxRetries: config.maxRetries, baseBackoffMs: config.baseBackoffMs, maxBackoffMs: config.maxBackoffMs, jobId },
  );
}

async function main() {
  const config = loadConfig();
  const provider = new JsonRpcProvider(config.sourceChainRpcUrl);
  const contract = new Contract(config.economicEventsAddress, ECONOMIC_EVENTS_ABI, provider);

  logger.info("relayer starting", {
    chainKey: config.sourceChainKey,
    status: "WATCHING",
  });

  startHealthServer(Number(process.env.HEALTH_PORT ?? 8787));

  for (const eventName of WATCHED_EVENT_NAMES) {
    contract.on(eventName, async (...eventArgs) => {
      const log = eventArgs[eventArgs.length - 1].log as Log;
      try {
        await processLog(config, log);
      } catch (err) {
        logger.error("job failed permanently", {
          sourceTxHash: log.transactionHash,
          errorCode: err instanceof PermanentError ? err.errorCode : "UNKNOWN",
        });
      }
    });
  }
}

main().catch((err) => {
  logger.error("relayer crashed", { errorCode: "FATAL", message: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
