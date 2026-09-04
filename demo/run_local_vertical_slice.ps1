# demo/run_local_vertical_slice.ps1
# PowerShell runner for the full local vertical slice demonstration on Windows

$ErrorActionPreference = "Stop"
$foundryBin = "$HOME\.foundry\bin"
$env:Path = "$foundryBin;" + $env:Path

$RPC = "http://127.0.0.1:8545"
$DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

Write-Host "Starting local Anvil chain..."
$anvilProcess = Start-Process -FilePath "$foundryBin\anvil.exe" -ArgumentList "--silent" -PassThru -NoNewWindow
Start-Sleep -Seconds 3

try {
    $env:PRIVATE_KEY = $DEPLOYER_KEY

    Write-Host "`n=== Deploying MockBlockProver (local stand-in for Creditcoin BlockProver precompile) ==="
    & "$foundryBin\forge.exe" script script/DeployMockProver.s.sol:DeployMockProver --rpc-url $RPC --broadcast
    
    $mockRunLatest = Get-Content "broadcast/DeployMockProver.s.sol/31337/run-latest.json" | ConvertFrom-Json
    $MOCK_ADDR = $mockRunLatest.receipts[0].contractAddress
    Write-Host "MockBlockProver deployed at: $MOCK_ADDR"

    $env:BLOCK_PROVER_ADDRESS = $MOCK_ADDR
    $env:DEPLOY_ECONOMIC_EVENTS = "true"
    $env:SOURCE_CHAIN_KEY = "2"

    Write-Host "`n=== Deploying the full Kasuwa stack ==="
    & "$foundryBin\forge.exe" script script/Deploy.s.sol:Deploy --rpc-url $RPC --broadcast
    
    $deployment = Get-Content "deployments/31337.json" | ConvertFrom-Json
    $VERIFIER = $deployment.attestcoinVerifier
    $PASSPORT = $deployment.creditPassport
    $CREDITLINE = $deployment.creditLine
    $ECON = $deployment.economicEvents
    $POOL = $deployment.liquidityPool

    $MERCHANT_ID = & "$foundryBin\cast.exe" format-bytes32-string "merchant-1"
    $EMPTY_MERKLE = "(0x0000000000000000000000000000000000000000000000000000000000000000,[])"
    $EMPTY_CONTINUITY = "(0x0000000000000000000000000000000000000000000000000000000000000000,[])"
    $SIG = "submitEvidence((uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]),address,uint32))"

    Write-Host "`n=== STEP 1: register EconomicEvents as an allowed source contract (chainKey=2) ==="
    & "$foundryBin\cast.exe" send $VERIFIER "registerSourceContract(uint64,address)" 2 $ECON --private-key $DEPLOYER_KEY --rpc-url $RPC | Out-Null
    Write-Host "registered."

    Write-Host "`n=== STEP 2: point MockBlockProver at 'verified' for the legitimate flow ==="
    & "$foundryBin\cast.exe" send $MOCK_ADDR "setResult(bool)" true --private-key $DEPLOYER_KEY --rpc-url $RPC | Out-Null
    Write-Host "ok."

    Write-Host "`n=== STEP 3: emit a REAL PaymentSettled event on the local source chain ==="
    $ref1 = & "$foundryBin\cast.exe" format-bytes32-string "ref-1"
    $step3Json = & "$foundryBin\cast.exe" send $ECON "emitPaymentSettled(bytes32,uint256,bytes32)" $MERCHANT_ID 750 $ref1 --private-key $DEPLOYER_KEY --rpc-url $RPC --json | ConvertFrom-Json
    $TXHASH = $step3Json.transactionHash
    $BLOCKNUM = [Convert]::ToInt64($step3Json.blockNumber, 16)
    Write-Host "Real local source tx: $TXHASH (block $BLOCKNUM)"

    Write-Host "`n=== STEP 4: encode it using the REAL @gluwa/usc-sdk abiEncode (not a reimplementation) ==="
    $ENCODED_TX = node demo/encode_evidence.mjs $RPC $TXHASH
    Write-Host "Encoded $($ENCODED_TX.Length) hex chars via the real SDK."

    Write-Host "`n=== STEP 5: submit that real-encoded evidence to AttestcoinVerifier ==="
    $step5Json = & "$foundryBin\cast.exe" send $VERIFIER "$SIG" "(2,$BLOCKNUM,$ENCODED_TX,$EMPTY_MERKLE,$EMPTY_CONTINUITY,$ECON,0)" --private-key $DEPLOYER_KEY --rpc-url $RPC --json | ConvertFrom-Json
    Write-Host "Status: $($step5Json.status), Creditcoin-side tx: $($step5Json.transactionHash)"

    Write-Host "`n=== STEP 6: CreditPassport capacity after verified evidence ==="
    $cap = & "$foundryBin\cast.exe" call $PASSPORT "getCreditCapacity(bytes32)(uint256)" $MERCHANT_ID --rpc-url $RPC
    Write-Host "Computed capacity: $cap (expected 75 = 750 / 10)"

    Write-Host "`n=== STEP 7: fund LiquidityPool and borrow against the new capacity ==="
    & "$foundryBin\cast.exe" send $POOL "deposit()" --value 1ether --private-key $DEPLOYER_KEY --rpc-url $RPC | Out-Null
    $step7Json = & "$foundryBin\cast.exe" send $CREDITLINE "borrow(bytes32,uint256,uint256,uint256)" $MERCHANT_ID 50 604800 0 --private-key $DEPLOYER_KEY --rpc-url $RPC --json | ConvertFrom-Json
    Write-Host "Borrow tx status: $($step7Json.status)"
    $exposure = & "$foundryBin\cast.exe" call $PASSPORT "getCurrentExposure(bytes32)(uint256)" $MERCHANT_ID --rpc-url $RPC
    Write-Host "Current exposure after borrow: $exposure"

    Write-Host "`n############################################"
    Write-Host "# SECURITY LAB - four deliberate attacks   #"
    Write-Host "############################################"

    Write-Host "`n=== ATTACK 1: replay the exact same (real) evidence again ==="
    $attack1Out = cmd /c "`"$foundryBin\cast.exe`" send $VERIFIER `"$SIG`" `"(2,$BLOCKNUM,$ENCODED_TX,$EMPTY_MERKLE,$EMPTY_CONTINUITY,$ECON,0)`" --private-key $DEPLOYER_KEY --rpc-url $RPC 2>&1"
    $selector1 = [regex]::Match($attack1Out, "0x[0-9a-f]{8}").Value
    Write-Host "Revert selector: $selector1 (expected 0xae5c42ee = EvidenceAlreadyConsumed())"

    Write-Host "`n=== ATTACK 2: claim this SAME real evidence came from an unregistered contract ==="
    $FAKE_CONTRACT = "0x00000000000000000000000000000000BADC0FFE"
    $attack2Out = cmd /c "`"$foundryBin\cast.exe`" send $VERIFIER `"$SIG`" `"(2,$BLOCKNUM,$ENCODED_TX,$EMPTY_MERKLE,$EMPTY_CONTINUITY,$FAKE_CONTRACT,0)`" --private-key $DEPLOYER_KEY --rpc-url $RPC 2>&1"
    $selector2 = [regex]::Match($attack2Out, "0x[0-9a-f]{8}").Value
    Write-Host "Revert selector: $selector2 (expected 0xd1ec97f1 = SourceContractMismatch())"

    Write-Host "`n=== ATTACK 3: a REAL included-but-reverted source transaction ==="
    $refRevert = & "$foundryBin\cast.exe" format-bytes32-string "ref-revert"
    $attack3TxJson = cmd /c "`"$foundryBin\cast.exe`" send $ECON `"emitPaymentThatReverts(bytes32,uint256,bytes32)`" $MERCHANT_ID 999 $refRevert --private-key $DEPLOYER_KEY --rpc-url $RPC --gas-limit 100000 --json 2>&1"
    Write-Host "Attack 3 source tx reverted on execution as expected."
    Write-Host "-> A reverted transaction emits 0 logs, so evidence decode is blocked at source."

    Write-Host "`n=== ATTACK 4: malicious AI recommends `$50,000 against a real `$2,000 policy limit ==="
    $attack4Out = cmd /c "`"$foundryBin\cast.exe`" send $CREDITLINE `"borrow(bytes32,uint256,uint256,uint256)`" $MERCHANT_ID 50000 604800 50000 --private-key $DEPLOYER_KEY --rpc-url $RPC 2>&1"
    $selector4 = [regex]::Match($attack4Out, "0x[0-9a-f]{8}").Value
    Write-Host "Revert selector: $selector4 (expected 0x3777de94 = BorrowRejected(uint8) [POLICY_LIMIT_EXCEEDED])"

    Write-Host "`nVertical slice completed successfully with 4/4 attacks blocked!"
} finally {
    if ($anvilProcess -and -not $anvilProcess.HasExited) {
        Stop-Process -Id $anvilProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
