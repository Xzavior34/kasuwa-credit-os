/**
 * Structured JSON logging so relayer output is machine-parseable (see docs/ARCHITECTURE.md
 * "Observability"). Every log line carries jobId/sourceTxHash/status where applicable.
 */
export interface LogFields {
  jobId?: string;
  sourceTxHash?: string;
  sourceBlock?: number;
  eventIndex?: number;
  chainKey?: number;
  status?: string;
  attempt?: number;
  creditcoinTxHash?: string;
  errorCode?: string;
  [key: string]: unknown;
}

function emit(level: "info" | "warn" | "error", message: string, fields: LogFields = {}): void {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
