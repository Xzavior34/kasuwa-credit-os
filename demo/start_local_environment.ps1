# demo/start_local_environment.ps1
# Starts local Anvil EVM node, deploys Kasuwa contracts, seeds initial test data, and serves the frontend.

$foundryBin = "$HOME\.foundry\bin"
$env:Path = "$foundryBin;" + $env:Path

$RPC = "http://127.0.0.1:8545"
$DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

Write-Host "========================================================="
Write-Host "    Kasuwa Credit OS - Local Development Environment     "
Write-Host "========================================================="

# 1. Start Anvil
Write-Host "`n[1/5] Starting Anvil local EVM on http://127.0.0.1:8545..."
$anvil = Start-Process -FilePath "$foundryBin\anvil.exe" -ArgumentList "--host 127.0.0.1 --port 8545 --silent" -PassThru -NoNewWindow
Start-Sleep -Seconds 2

# 2. Deploy MockBlockProver
$env:PRIVATE_KEY = $DEPLOYER_KEY
Write-Host "`n[2/5] Deploying MockBlockProver..."
& "$foundryBin\forge.exe" script script/DeployMockProver.s.sol:DeployMockProver --rpc-url $RPC --broadcast | Out-Null
$mockJson = Get-Content "broadcast/DeployMockProver.s.sol/31337/run-latest.json" | ConvertFrom-Json
$MOCK_ADDR = $mockJson.receipts[0].contractAddress
Write-Host "MockBlockProver: $MOCK_ADDR"

# 3. Deploy Kasuwa Stack
$env:BLOCK_PROVER_ADDRESS = $MOCK_ADDR
$env:DEPLOY_ECONOMIC_EVENTS = "true"
$env:SOURCE_CHAIN_KEY = "2"
Write-Host "`n[3/5] Deploying Kasuwa contracts..."
& "$foundryBin\forge.exe" script script/Deploy.s.sol:Deploy --rpc-url $RPC --broadcast | Out-Null

$deployment = Get-Content "deployments/31337.json" | ConvertFrom-Json
Copy-Item "deployments/31337.json" "frontend/deployment.local.json" -Force

Write-Host "Contracts deployed successfully:"
Write-Host " - AttestcoinVerifier: $($deployment.attestcoinVerifier)"
Write-Host " - CreditPassport:     $($deployment.creditPassport)"
Write-Host " - CreditEngine:       $($deployment.creditEngine)"
Write-Host " - PolicyEngine:       $($deployment.policyEngine)"
Write-Host " - LiquidityPool:      $($deployment.liquidityPool)"
Write-Host " - CreditLine:         $($deployment.creditLine)"
Write-Host " - EconomicEvents:     $($deployment.economicEvents)"

# 4. Setup initial state and seed sample merchant data
Write-Host "`n[4/5] Initializing protocol configuration and sample state..."
$VERIFIER = $deployment.attestcoinVerifier
$PASSPORT = $deployment.creditPassport
$CREDITLINE = $deployment.creditLine
$ECON = $deployment.economicEvents
$POOL = $deployment.liquidityPool

# Register source contract & set mock prover to true
& "$foundryBin\cast.exe" send $VERIFIER "registerSourceContract(uint64,address)" 2 $ECON --private-key $DEPLOYER_KEY --rpc-url $RPC | Out-Null
& "$foundryBin\cast.exe" send $MOCK_ADDR "setResult(bool)" true --private-key $DEPLOYER_KEY --rpc-url $RPC | Out-Null

# Deposit initial pool liquidity
& "$foundryBin\cast.exe" send $POOL "deposit()" --value 10ether --private-key $DEPLOYER_KEY --rpc-url $RPC | Out-Null

# Seed merchant-1 with verified payment and loan repayment
$MERCHANT_ID = & "$foundryBin\cast.exe" format-bytes32-string "merchant-1"
$EMPTY_MERKLE = "(0x0000000000000000000000000000000000000000000000000000000000000000,[])"
$EMPTY_CONTINUITY = "(0x0000000000000000000000000000000000000000000000000000000000000000,[])"
$SIG = "submitEvidence((uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]),address,uint32))"

$ref1 = & "$foundryBin\cast.exe" format-bytes32-string "pay-seed-1"
$step1Json = & "$foundryBin\cast.exe" send $ECON "emitPaymentSettled(bytes32,uint256,bytes32)" $MERCHANT_ID 1200 $ref1 --private-key $DEPLOYER_KEY --rpc-url $RPC --json | ConvertFrom-Json
$tx1 = $step1Json.transactionHash
$block1 = [Convert]::ToInt64($step1Json.blockNumber, 16)
$encodedTx1 = node demo/encode_evidence.mjs $RPC $tx1
& "$foundryBin\cast.exe" send $VERIFIER "$SIG" "(2,$block1,$encodedTx1,$EMPTY_MERKLE,$EMPTY_CONTINUITY,$ECON,0)" --private-key $DEPLOYER_KEY --rpc-url $RPC | Out-Null

$initialCap = & "$foundryBin\cast.exe" call $PASSPORT "getCreditCapacity(bytes32)(uint256)" $MERCHANT_ID --rpc-url $RPC
Write-Host "Sample merchant-1 initialized with capacity: $initialCap"

# 5. Start Frontend server
Write-Host "`n[5/5] Launching Frontend web server on http://localhost:3000..."
Write-Host "Open http://localhost:3000 in your browser to interact with Kasuwa Credit OS."
Write-Host "Press Ctrl+C to stop.`n"

Set-Location "frontend"
node -e "
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(process.cwd(), reqPath);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Frontend server live at http://localhost:3000');
});
"
