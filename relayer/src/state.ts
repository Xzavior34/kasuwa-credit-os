import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Relayer job state machine (see docs/ARCHITECTURE.md "Relayer state machine"):
 *
 *   DETECTED -> SOURCE_CONFIRMED -> WAITING_FOR_ATTESTATION -> PROOF_GENERATING
 *            -> PROOF_READY -> SUBMITTING -> CONFIRMED -> CREDIT_UPDATED
 *
 * Failure states: SOURCE_FAILED, PROOF_FAILED, INVALID_SOURCE, REPLAYED, POLICY_REJECTED,
 * SUBMISSION_FAILED.
 *
 * NOTE on persistence: this is a flat-file JSON store (state/jobs.json) so the demo is self
 * contained and restart-safe without external infrastructure. It intentionally uses the same
 * (chainKey, sourceTxHash, logIndex) identity as AttestcoinVerifier's on-chain replay
 * protection as the job key — but the ON-CHAIN mapping is the ultimate authority against
 * duplicate credit updates (see AttestcoinVerifier.evidenceConsumed). If this file is lost or
 * out of sync, re-running a job is safe: submitEvidence() will simply revert with
 * EvidenceAlreadyConsumed for anything already processed on-chain. A production deployment
 * should replace this with a real database, but must keep the same principle: the relayer's
 * local bookkeeping is a performance/observability aid, never the source of truth for
 * "has this evidence already been credited".
 */
export type JobStatus =
  | "DETECTED"
  | "SOURCE_CONFIRMED"
  | "WAITING_FOR_ATTESTATION"
  | "PROOF_GENERATING"
  | "PROOF_READY"
  | "SUBMITTING"
  | "CONFIRMED"
  | "CREDIT_UPDATED"
  | "SOURCE_FAILED"
  | "PROOF_FAILED"
  | "INVALID_SOURCE"
  | "REPLAYED"
  | "POLICY_REJECTED"
  | "SUBMISSION_FAILED";

export interface JobRecord {
  jobId: string;
  sourceTxHash: string;
  sourceBlock: number;
  logIndex: number;
  chainKey: number;
  status: JobStatus;
  attempt: number;
  creditcoinTxHash?: string;
  errorCode?: string;
  updatedAt: string;
}

const STATE_PATH = "state/jobs.json";

async function readAll(): Promise<Record<string, JobRecord>> {
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, JobRecord>;
  } catch {
    return {};
  }
}

async function writeAll(jobs: Record<string, JobRecord>): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(jobs, null, 2), "utf-8");
}

export function makeJobId(chainKey: number, sourceTxHash: string, logIndex: number): string {
  return `${chainKey}:${sourceTxHash}:${logIndex}`;
}

export async function getJob(jobId: string): Promise<JobRecord | undefined> {
  const jobs = await readAll();
  return jobs[jobId];
}

export async function upsertJob(job: Omit<JobRecord, "updatedAt">): Promise<JobRecord> {
  const jobs = await readAll();
  const record: JobRecord = { ...job, updatedAt: new Date().toISOString() };
  jobs[job.jobId] = record;
  await writeAll(jobs);
  return record;
}
