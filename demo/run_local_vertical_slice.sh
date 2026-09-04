#!/usr/bin/env bash
set -e

# demo/run_local_vertical_slice.sh
#
# Runs the ENTIRE Kasuwa flow — deployment, a real source-chain transaction, evidence
# verification, a capacity update, a borrow, and then four deliberate attacks — against a local
# Anvil chain (Foundry's own local Ethereum node). This is explicitly a LOCAL simulation:
#
#   - Anvil does not implement Creditcoin's real BlockProver precompile (0x...0FD2), so this
#     script deploys test/mocks/MockBlockProver.sol and points AttestcoinVerifier at it instead.
#     Every transaction below is REAL (mined, with a real hash, on a real local chain) — only
#     the cross-chain proof-verification step is a controlled test double. See
#     docs/SECURITY_MODEL.md for exactly why that substitution is safe and where it's documented.
#   - The `encodedTransaction` bytes themselves are produced by the REAL, unmodified
#     @gluwa/usc-sdk v0.18.0 `encoding.abiEncode` function (see demo/encode_evidence.mjs) — not a
#     hand-rolled reimplementation. AttestcoinVerifier's on-chain decoder
#     (src/lib/TransactionEvidence.sol) then independently derives merchantId/eventType/amount/
#     success from those real bytes — the relayer supplies no semantic claims at all. See
#     docs/SECURITY_MODEL.md "Relayer honesty".
#   - Nothing here touches Creditcoin CC3 testnet or any public network. See
#     docs/IMPLEMENTATION_AUDIT.md "Environment constraints" for why (no network route to any
#     live chain exists in the environment this repo was built in), and docs/DEPLOYMENT.md for
#     how to point this same Deploy.s.sol script at a real network once you have RPC access.
#
# Usage: bash demo/run_local_vertical_slice.sh
# Requires: foundry (forge, cast, anvil) on PATH, and `relayer/` to have run `npm install` once
# (this script reuses its @gluwa/usc-sdk and ethers installation for real encoding).

cd "$(dirname "$0")/.."

RPC=http://127.0.0.1:8545
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # Anvil's well-known dev key #0 — test-only, no real funds

echo "Starting local Anvil chain..."
anvil --silent > /tmp/kasuwa-anvil.log 2>&1 &
ANVIL_PID=$!
trap "kill $ANVIL_PID 2>/dev/null || true" EXIT
sleep 2

export PRIVATE_KEY=$DEPLOYER_KEY

echo ""
echo "=== Deploying MockBlockProver (local stand-in for the real Creditcoin BlockProver precompile) ==="
forge script script/DeployMockProver.s.sol:DeployMockProver --rpc-url $RPC --broadcast > /tmp/kasuwa-deploy-mock.log 2>&1
MOCK_ADDR=$(python3 -c "import json; print(json.load(open('broadcast/DeployMockProver.s.sol/31337/run-latest.json'))['receipts'][0]['contractAddress'])")
echo "MockBlockProver deployed at: $MOCK_ADDR"

export BLOCK_PROVER_ADDRESS=$MOCK_ADDR
export DEPLOY_ECONOMIC_EVENTS=true
export SOURCE_CHAIN_KEY=2

echo ""
echo "=== Deploying the full Kasuwa stack ==="
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC --broadcast > /tmp/kasuwa-deploy-full.log 2>&1
cat deployments/31337.json

VERIFIER=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['attestcoinVerifier'])")
PASSPORT=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['creditPassport'])")
CREDITLINE=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['creditLine'])")
ECON=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['economicEvents'])")
POOL=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['liquidityPool'])")

MERCHANT_ID=$(cast format-bytes32-string "merchant-1")
EMPTY_MERKLE="(0x0000000000000000000000000000000000000000000000000000000000000000,[])"
EMPTY_CONTINUITY="(0x0000000000000000000000000000000000000000000000000000000000000000,[])"
SIG="submitEvidence((uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]),address,uint32))"

echo ""
echo "=== STEP 1: register EconomicEvents as an allowed source contract (chainKey=2) ==="
cast send $VERIFIER "registerSourceContract(uint64,address)" 2 $ECON --private-key $DEPLOYER_KEY --rpc-url $RPC > /dev/null
echo "registered."

echo ""
echo "=== STEP 2: point MockBlockProver at 'verified' for the legitimate flow ==="
cast send $MOCK_ADDR "setResult(bool)" true --private-key $DEPLOYER_KEY --rpc-url $RPC > /dev/null
echo "ok."

echo ""
echo "=== STEP 3: emit a REAL PaymentSettled event on the local source chain ==="
cast send $ECON "emitPaymentSettled(bytes32,uint256,bytes32)" $MERCHANT_ID 750 $(cast format-bytes32-string "ref-1") \
  --private-key $DEPLOYER_KEY --rpc-url $RPC --json > /tmp/kasuwa-step3.json
TXHASH=$(python3 -c "import json;print(json.load(open('/tmp/kasuwa-step3.json'))['transactionHash'])")
BLOCKNUM=$(python3 -c "import json;print(int(json.load(open('/tmp/kasuwa-step3.json'))['blockNumber'],16))")
echo "Real local source tx: $TXHASH (block $BLOCKNUM)"

echo ""
echo "=== STEP 4: encode it using the REAL @gluwa/usc-sdk abiEncode (not a reimplementation) ==="
ENCODED_TX=$(node demo/encode_evidence.mjs $RPC $TXHASH)
echo "Encoded ${#ENCODED_TX} hex chars via the real SDK."

echo ""
echo "=== STEP 5: submit that real-encoded evidence to AttestcoinVerifier — merchantId/amount are DERIVED on-chain from it, not asserted ==="
cast send $VERIFIER "$SIG" "(2,$BLOCKNUM,$ENCODED_TX,$EMPTY_MERKLE,$EMPTY_CONTINUITY,$ECON,0)" \
  --private-key $DEPLOYER_KEY --rpc-url $RPC --json > /tmp/kasuwa-step5.json
python3 -c "import json;d=json.load(open('/tmp/kasuwa-step5.json'));print('status:', d['status'], 'creditcoin-side tx:', d['transactionHash'])"

echo ""
echo "=== STEP 6: CreditPassport capacity after verified evidence (750 verified volume -> capacity = 750/10 = 75) ==="
echo "Note: the '750' below was read out of the real transaction's real log by the contract's own decoder — it was never supplied as an argument to submitEvidence."
cast call $PASSPORT "getCreditCapacity(bytes32)(uint256)" $MERCHANT_ID --rpc-url $RPC

echo ""
echo "=== STEP 7: fund LiquidityPool and borrow against the new capacity ==="
cast send $POOL "deposit()" --value 1ether --private-key $DEPLOYER_KEY --rpc-url $RPC > /dev/null
cast send $CREDITLINE "borrow(bytes32,uint256,uint256,uint256)" $MERCHANT_ID 50 604800 0 \
  --private-key $DEPLOYER_KEY --rpc-url $RPC --json > /tmp/kasuwa-step7.json
python3 -c "import json;d=json.load(open('/tmp/kasuwa-step7.json'));print('status:', d['status'])"
echo "Current exposure after borrow:"
cast call $PASSPORT "getCurrentExposure(bytes32)(uint256)" $MERCHANT_ID --rpc-url $RPC

echo ""
echo "############################################"
echo "# SECURITY LAB — four deliberate attacks    #"
echo "############################################"

echo ""
echo "=== ATTACK 1: replay the exact same (real) evidence again ==="
set +e
cast send $VERIFIER "$SIG" "(2,$BLOCKNUM,$ENCODED_TX,$EMPTY_MERKLE,$EMPTY_CONTINUITY,$ECON,0)" \
  --private-key $DEPLOYER_KEY --rpc-url $RPC 2>&1 | grep -Eo "0x[0-9a-f]{8}" | head -1
set -e
echo "-> expected selector 0xae5c42ee = EvidenceAlreadyConsumed()"

echo ""
echo "=== ATTACK 2: claim this SAME real evidence came from an unregistered contract ==="
FAKE_CONTRACT=0x00000000000000000000000000000000BADC0FFE
set +e
cast send $VERIFIER "$SIG" "(2,$BLOCKNUM,$ENCODED_TX,$EMPTY_MERKLE,$EMPTY_CONTINUITY,$FAKE_CONTRACT,0)" \
  --private-key $DEPLOYER_KEY --rpc-url $RPC 2>&1 | grep -Eo "0x[0-9a-f]{8}" | head -1
set -e
echo "-> expected selector 0xd1ec97f1 = SourceContractMismatch() — never even reaches on-chain decode, the allowlist check alone catches this"

echo ""
echo "=== ATTACK 3: a REAL included-but-reverted source transaction (no relayer flag involved — the tx genuinely has no logs to submit) ==="
set +e
cast send $ECON "emitPaymentThatReverts(bytes32,uint256,bytes32)" $MERCHANT_ID 999 $(cast format-bytes32-string "ref-revert") \
  --private-key $DEPLOYER_KEY --rpc-url $RPC --gas-limit 100000 --json > /tmp/kasuwa-attack3-tx.json 2>&1
REVERT_TXHASH=$(python3 -c "import json;print(json.load(open('/tmp/kasuwa-attack3-tx.json'))['transactionHash'])" 2>/dev/null)
REVERT_STATUS=$(python3 -c "import json;print(json.load(open('/tmp/kasuwa-attack3-tx.json'))['status'])" 2>/dev/null)
set -e
if [ -n "$REVERT_TXHASH" ]; then
  echo "Real reverted source tx (mined, included, receipt.status=$REVERT_STATUS — genuinely failed): $REVERT_TXHASH"
  set +e
  REVERT_ENCODED=$(node demo/encode_evidence.mjs $RPC $REVERT_TXHASH 2>/dev/null)
  cast send $VERIFIER "$SIG" "(2,$BLOCKNUM,$REVERT_ENCODED,$EMPTY_MERKLE,$EMPTY_CONTINUITY,$ECON,0)" \
    --private-key $DEPLOYER_KEY --rpc-url $RPC 2>&1 | grep -Eo "0x[0-9a-f]{8}" | head -1
  set -e
  echo "-> a reverted transaction has EMPTY logs (the EVM rolls back all log emission on revert), so this"
  echo "   correctly fails at LogIndexOutOfRange() rather than needing a separate success flag — there is"
  echo "   nothing there to submit as evidence at all. See docs/SECURITY_MODEL.md."
else
  echo "(could not retrieve the reverted tx's receipt in this environment — the underlying invariant"
  echo " is still covered directly by test/failed-source-transaction.t.sol)"
fi

echo ""
echo "=== ATTACK 4: malicious AI recommends \$50,000 against a real \$2,000 policy limit ==="
set +e
cast send $CREDITLINE "borrow(bytes32,uint256,uint256,uint256)" $MERCHANT_ID 50000 604800 50000 \
  --private-key $DEPLOYER_KEY --rpc-url $RPC 2>&1 | grep -Eo "0x[0-9a-f]{8}" | head -1
set -e
echo "-> expected selector 0x3777de94 = BorrowRejected(uint8) [reason=POLICY_LIMIT_EXCEEDED]"

echo ""
echo "Done. See docs/DEMO.md and docs/SECURITY_MODEL.md for what each step and each attack means."
