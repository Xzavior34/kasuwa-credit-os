/**
 * Relayer configuration. All values come from environment variables (see ../.env.example).
 * Nothing here is hardcoded to a specific network — see docs/NETWORKS.md for how the actual
 * addresses/URLs are obtained and verified before use.
 */
export interface RelayerConfig {
  sourceChainRpcUrl: string;
  sourceChainKey: number; // Creditcoin-side chainKey identifying this source chain (NOT chainId)
  economicEventsAddress: string; // deployed EconomicEvents.sol address on the source chain

  creditcoinRpcUrl: string;
  creditcoinProofBuilderUrl: string;
  attestcoinVerifierAddress: string; // deployed AttestcoinVerifier.sol address on Creditcoin

  privateKey: string; // relayer's own key — submits transactions, never custodies user funds

  maxRetries: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): RelayerConfig {
  return {
    sourceChainRpcUrl: requireEnv("SOURCE_CHAIN_RPC_URL"),
    sourceChainKey: Number(requireEnv("SOURCE_CHAIN_KEY")),
    economicEventsAddress: requireEnv("ECONOMIC_EVENTS_ADDRESS"),

    creditcoinRpcUrl: requireEnv("CREDITCOIN_RPC_URL"),
    creditcoinProofBuilderUrl: requireEnv("CREDITCOIN_PROOF_BUILDER_URL"),
    attestcoinVerifierAddress: requireEnv("ATTESTCOIN_VERIFIER_ADDRESS"),

    privateKey: requireEnv("PRIVATE_KEY"),

    maxRetries: Number(process.env.MAX_RETRIES ?? 5),
    baseBackoffMs: Number(process.env.BASE_BACKOFF_MS ?? 2_000),
    maxBackoffMs: Number(process.env.MAX_BACKOFF_MS ?? 60_000),
  };
}
