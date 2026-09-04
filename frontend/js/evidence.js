// frontend/js/evidence.js - Pure USC v0.18.0 Compliant Evidence Packaging in the Browser

import { EVENT_SIGNATURES } from './config.js';

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

/**
 * Builds a raw log tuple matching the on-chain event format
 */
export function buildRawLog(emitter, eventType, merchantId, amount, refBytes32 = null) {
  const topics = [
    EVENT_SIGNATURES[eventType],
    merchantId,
    ethers.zeroPadValue("0x000000000000000000000000000000000000dEaD", 32)
  ];
  const ref = refBytes32 || ethers.encodeBytes32String("ref-" + Date.now().toString().slice(-6));
  const timestamp = Math.floor(Date.now() / 1000);
  const data = abiCoder.encode(["uint256", "bytes32", "uint64"], [amount, ref, timestamp]);
  return [emitter, topics, data];
}

/**
 * Builds encoded transaction chunk array (3 chunks) for AttestcoinVerifier & TransactionEvidence.sol
 */
export function buildEncodedTransaction(to, sourceTxSuccess, logs, nonceSalt = 0) {
  // Chunk 1: Tx details (nonce, gasLimit, to, isCreation, from, value, data)
  const chunk1 = abiCoder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [nonceSalt, 21000, "0x0000000000000000000000000000000000001111", false, to, 0, "0x"]
  );

  // Chunk 2: Fee details (type, maxPriorityFeePerGas, maxFeePerGas)
  const chunk2 = abiCoder.encode(
    ["uint64", "uint128", "uint128"],
    [2, 1000000000n, 20000000000n]
  );

  // Chunk 3: Receipt details (status, cumulativeGasUsed, logs, logsBloom)
  const chunk3 = abiCoder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [sourceTxSuccess ? 1 : 0, 21000, logs, "0x"]
  );

  // USC envelope: version 2, bytes[] chunks
  return abiCoder.encode(["uint8", "bytes[]"], [2, [chunk1, chunk2, chunk3]]);
}

/**
 * Creates empty merkle and continuity proofs for mock prover
 */
export function buildEmptyProofs() {
  return {
    merkleProof: [ethers.ZeroHash, []],
    continuityProof: [ethers.ZeroHash, []]
  };
}
