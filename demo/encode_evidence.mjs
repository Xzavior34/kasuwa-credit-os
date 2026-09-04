// demo/encode_evidence.mjs
//
// Encodes a real transaction+receipt using the ACTUAL, unmodified @gluwa/usc-sdk v0.18.0
// `encoding.abiEncode` function — not a reimplementation. This is exactly what a real relayer
// would do (see relayer/src/proof-builder.ts), except a real relayer gets the Merkle/continuity
// proof from Creditcoin's Proof Builder service too, which this sandbox cannot reach. Here we
// only need the encoded transaction bytes themselves, since MockBlockProver ignores the proof
// arguments — see docs/SECURITY_MODEL.md for exactly what that substitution does and doesn't
// prove.
//
// Usage: node demo/encode_evidence.mjs <rpcUrl> <txHash>
// Prints the encoded bytes (hex string) to stdout, nothing else.

import { ethers } from "../relayer/node_modules/ethers/lib.esm/index.js";
import { encoding } from "../relayer/node_modules/@gluwa/usc-sdk/dist/index.js";

const [, , rpcUrl, txHash] = process.argv;
if (!rpcUrl || !txHash) {
  console.error("Usage: node demo/encode_evidence.mjs <rpcUrl> <txHash>");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const txWithRaw = await encoding.getTransactionWithRaw(provider, txHash);
const receipt = await provider.getTransactionReceipt(txHash);
const result = encoding.abiEncode(txWithRaw, receipt);
process.stdout.write(result.abi);
