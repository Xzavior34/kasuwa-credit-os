#!/usr/bin/env bash
set -euo pipefail

# Deployment smoke test. Reads deployments/<chainId>.json for a chain the caller has already
# deployed to, and confirms via `cast call` that the cross-contract wiring actually took (not
# just that the deploy script exited 0). This is a REAL read against a REAL RPC — whatever
# --rpc-url points at. It does not fabricate results; every value printed below is a live
# `cast call` response.
#
# Usage: RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 ./script/smoke-test.sh

RPC_URL="${RPC_URL:?Set RPC_URL, e.g. http://127.0.0.1:8545}"
CHAIN_ID="${CHAIN_ID:?Set CHAIN_ID, e.g. 31337}"
DEPLOYMENT_FILE="deployments/${CHAIN_ID}.json"

if [ ! -f "$DEPLOYMENT_FILE" ]; then
  echo "No deployment file at $DEPLOYMENT_FILE — run script/Deploy.s.sol against this chain first."
  exit 1
fi

PASSPORT=$(python3 -c "import json;print(json.load(open('$DEPLOYMENT_FILE'))['creditPassport'])")
VERIFIER=$(python3 -c "import json;print(json.load(open('$DEPLOYMENT_FILE'))['attestcoinVerifier'])")
POOL=$(python3 -c "import json;print(json.load(open('$DEPLOYMENT_FILE'))['liquidityPool'])")
CREDIT_LINE=$(python3 -c "import json;print(json.load(open('$DEPLOYMENT_FILE'))['creditLine'])")
ECONOMIC_EVENTS=$(python3 -c "import json;print(json.load(open('$DEPLOYMENT_FILE'))['economicEvents'])")
SOURCE_CHAIN_KEY=$(python3 -c "import json;print(json.load(open('$DEPLOYMENT_FILE'))['sourceChainKey'])")

echo "== Smoke test against $RPC_URL (chainId $CHAIN_ID) =="
echo "CreditPassport:     $PASSPORT"
echo "AttestcoinVerifier: $VERIFIER"
echo "LiquidityPool:      $POOL"
echo "CreditLine:         $CREDIT_LINE"
echo "EconomicEvents:     $ECONOMIC_EVENTS"
echo

FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$(echo "$actual" | tr '[:upper:]' '[:lower:]')" = "$(echo "$expected" | tr '[:upper:]' '[:lower:]')" ]; then
    echo "  [OK] $label"
  else
    echo "  [FAIL] $label — expected $expected, got $actual"
    FAIL=1
  fi
}

echo "-- Verifying CreditPassport wiring --"
ACTUAL_VERIFIER=$(cast call "$PASSPORT" "attestcoinVerifier()(address)" --rpc-url "$RPC_URL")
check "CreditPassport.attestcoinVerifier == deployed AttestcoinVerifier" "$VERIFIER" "$ACTUAL_VERIFIER"

ACTUAL_CREDIT_LINE=$(cast call "$PASSPORT" "creditLine()(address)" --rpc-url "$RPC_URL")
check "CreditPassport.creditLine == deployed CreditLine" "$CREDIT_LINE" "$ACTUAL_CREDIT_LINE"

echo "-- Verifying LiquidityPool wiring --"
ACTUAL_POOL_CREDIT_LINE=$(cast call "$POOL" "creditLine()(address)" --rpc-url "$RPC_URL")
check "LiquidityPool.creditLine == deployed CreditLine" "$CREDIT_LINE" "$ACTUAL_POOL_CREDIT_LINE"

echo "-- Verifying AttestcoinVerifier wiring --"
ACTUAL_PASSPORT=$(cast call "$VERIFIER" "creditPassport()(address)" --rpc-url "$RPC_URL")
check "AttestcoinVerifier.creditPassport == deployed CreditPassport" "$PASSPORT" "$ACTUAL_PASSPORT"

ACTUAL_REGISTERED=$(cast call "$VERIFIER" "registeredSourceContracts(uint64,address)(bool)" "$SOURCE_CHAIN_KEY" "$ECONOMIC_EVENTS" --rpc-url "$RPC_URL")
check "EconomicEvents registered as a source contract" "true" "$ACTUAL_REGISTERED"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "SMOKE TEST PASSED — all cross-contract wiring confirmed via live cast calls."
else
  echo "SMOKE TEST FAILED — see [FAIL] lines above."
  exit 1
fi
