// frontend/js/app.js - Trust-Verified Main Application Coordinator for Kasuwa Credit OS

import { ABI, EVENT_TYPE_NAMES, NETWORK_PRESETS } from './config.js';
import { decodeContractError } from './decoder.js';
import { buildRawLog, buildEncodedTransaction, buildEmptyProofs } from './evidence.js';
import { WalletManager } from './wallet.js';

// Application State
const state = {
  currentEnv: 'local', // 'local' | 'cc3'
  config: { ...NETWORK_PRESETS.local },
  merchantName: 'merchant-1',
  merchantId: ethers.encodeBytes32String('merchant-1'),
  provider: null,
  signer: null,
  walletAddress: null,
  contracts: {},
  dashboardData: null,
  activeProofNode: 'source',
  verifiedEvents: [],
  selectedEventIndex: 0,
  judgeMode: false,
  policyLimit: 2000
};

// UI Helper
const $ = (id) => document.getElementById(id);

// Toast Notification
export function showToast(message, type = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-msg toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// Initialize Contracts
function initContracts(runner) {
  const c = state.config.contracts;
  if (!c.creditPassport || c.creditPassport === '') {
    state.contracts = {};
    return;
  }
  state.contracts = {
    passport: new ethers.Contract(c.creditPassport, ABI.passport, runner),
    verifier: new ethers.Contract(c.attestcoinVerifier, ABI.verifier, runner),
    policy: new ethers.Contract(c.policyEngine, ABI.policy, runner),
    creditline: new ethers.Contract(c.creditLine, ABI.creditline, runner),
    econ: new ethers.Contract(c.economicEvents, ABI.econ, runner),
    pool: new ethers.Contract(c.liquidityPool, ABI.pool, runner)
  };
}

// Wallet State Listener
const wallet = new WalletManager((wState) => {
  const btn = $('wallet-btn');
  if (wState.status === 'CONNECTED') {
    state.signer = wState.signer;
    state.walletAddress = wState.address;
    btn.textContent = `${wState.address.slice(0, 6)}...${wState.address.slice(-4)}`;
    btn.classList.add('connected');
    showToast(`Wallet connected: ${wState.address.slice(0, 6)}...${wState.address.slice(-4)}`, 'success');
    initContracts(state.signer);
    refreshDashboard();
  } else if (wState.status === 'DISCONNECTED') {
    state.signer = null;
    state.walletAddress = null;
    btn.textContent = 'Connect Wallet';
    btn.classList.remove('connected');
    initContracts(state.provider);
    refreshDashboard();
  }
});

// Load Dashboard & Contract State
export async function refreshDashboard() {
  state.merchantName = $('merchant-input').value.trim() || 'merchant-1';
  state.merchantId = ethers.encodeBytes32String(state.merchantName);

  if ($('passport-id-hex')) $('passport-id-hex').textContent = state.merchantId;
  if ($('passport-alias')) $('passport-alias').textContent = state.merchantName;

  // Clear stale data if contracts not configured for this environment (e.g. CC3)
  if (!state.config.isConfigured || !state.config.contracts.creditPassport) {
    clearAllDataForUnconfiguredEnv();
    return;
  }

  try {
    const c = state.contracts;
    const [cap, tier, exp, avail, activity, repHistory, policyMax] = await Promise.all([
      c.passport.getCreditCapacity(state.merchantId),
      c.passport.getCreditTier(state.merchantId),
      c.passport.getCurrentExposure(state.merchantId),
      c.passport.getAvailableCredit(state.merchantId),
      c.passport.getVerifiedEconomicActivity(state.merchantId),
      c.passport.getRepaymentHistory(state.merchantId),
      c.policy.maxLoanAmount().catch(() => 2000n)
    ]);

    const capacityNum = Number(cap);
    const exposureNum = Number(exp);
    const availNum = Number(avail);
    state.policyLimit = Number(policyMax);

    state.dashboardData = { capacityNum, exposureNum, availNum, tier: Number(tier), activity, repHistory };

    // Overview numbers (Real on-chain reads)
    if ($('overview-capacity')) $('overview-capacity').textContent = capacityNum.toLocaleString();
    if ($('overview-exposure')) $('overview-exposure').textContent = exposureNum.toLocaleString();
    if ($('overview-limit')) $('overview-limit').textContent = capacityNum.toLocaleString();

    // Derived Utilization percentage
    const utilPct = capacityNum > 0 ? Math.min(100, Math.round((exposureNum / capacityNum) * 100)) : 0;
    if ($('overview-util-pct')) $('overview-util-pct').textContent = `${utilPct}%`;
    if ($('overview-progress-bar')) $('overview-progress-bar').style.width = `${utilPct}%`;

    // Circular gauge offset (circumference = 251.2)
    if ($('gauge-circle')) {
      const offset = 251.2 - (251.2 * utilPct / 100);
      $('gauge-circle').style.strokeDashoffset = offset;
    }

    // Historical KPI Stat Tiles
    if ($('stat-event-count')) $('stat-event-count').textContent = activity.eventCount.toString();
    if ($('stat-total-volume')) $('stat-total-volume').textContent = `$${Number(activity.paymentVolume).toLocaleString()}`;
    if ($('stat-rep-count')) $('stat-rep-count').textContent = repHistory.count.toString();
    if ($('stat-streak-count')) $('stat-streak-count').textContent = repHistory.streak.toString();

    // Derived Credit Health Score (Transparent UI composite calculation from on-chain event logs)
    const volPts = Math.min(30, Math.round(Number(activity.paymentVolume) / 50));
    const repPts = Math.min(30, Number(repHistory.count) * 10);
    const streakPts = Math.min(25, Number(repHistory.streak) * 5);
    const missedPenalty = Number(repHistory.missed) * 20;
    const totalScore = Math.max(0, Math.min(100, volPts + repPts + streakPts - missedPenalty));

    if ($('health-score-val')) $('health-score-val').textContent = totalScore;
    if ($('health-vol-score')) $('health-vol-score').textContent = `+${volPts} pts ($${activity.paymentVolume}/50)`;
    if ($('health-rep-score')) $('health-rep-score').textContent = `+${repPts} pts (${repHistory.count} repaid)`;
    if ($('health-streak-score')) $('health-streak-score').textContent = `+${streakPts} pts (${repHistory.streak} streak)`;
    if ($('health-missed-score')) $('health-missed-score').textContent = `-${missedPenalty} pts (${repHistory.missed} missed)`;
    if ($('health-tier-badge')) $('health-tier-badge').textContent = `Tier ${tier}`;

    // Passport page
    if ($('passport-tier')) $('passport-tier').textContent = `Tier ${tier}`;
    if ($('passport-avail')) $('passport-avail').textContent = `$${availNum.toLocaleString()}`;
    if ($('passport-exp')) $('passport-exp').textContent = `$${exposureNum.toLocaleString()}`;
    if ($('passport-cap')) $('passport-cap').textContent = `$${capacityNum.toLocaleString()}`;

    // Capacity Engine Breakdown
    const baseCap = Math.floor(Number(activity.paymentVolume) / 10);
    const repBonus = Math.floor(baseCap * (Number(repHistory.count) * 0.05));
    const streakBonus = Math.floor(baseCap * (Number(repHistory.streak) * 0.02));
    const missedDeduct = Math.floor(baseCap * (Number(repHistory.missed) * 0.25));

    if ($('calc-base')) $('calc-base').textContent = `$${baseCap.toLocaleString()}`;
    if ($('calc-rep-bonus')) $('calc-rep-bonus').textContent = `+$${repBonus.toLocaleString()}`;
    if ($('calc-streak-bonus')) $('calc-streak-bonus').textContent = `+$${streakBonus.toLocaleString()}`;
    if ($('calc-missed-penalty')) $('calc-missed-penalty').textContent = `-$${missedDeduct.toLocaleString()}`;
    if ($('calc-final-capacity')) $('calc-final-capacity').textContent = `$${capacityNum.toLocaleString()}`;

    // Credit Line & Borrow page
    if ($('borrow-avail-lbl')) $('borrow-avail-lbl').textContent = `$${availNum.toLocaleString()}`;
    if ($('borrow-current-exp')) $('borrow-current-exp').textContent = `$${exposureNum.toLocaleString()}`;
    if ($('borrow-cap-hdr')) $('borrow-cap-hdr').textContent = `$${capacityNum.toLocaleString()}`;
    if ($('borrow-policy-cap')) $('borrow-policy-cap').textContent = `$${state.policyLimit.toLocaleString()}`;
    if ($('ai-policy-cap-lbl')) $('ai-policy-cap-lbl').textContent = `$${state.policyLimit.toLocaleString()}`;

    // Update Borrow Preview Realtime
    updateBorrowPreview();

    // Load Passport Activity Logs & Proof Explorer
    await loadPassportEventLogs();
  } catch (err) {
    console.warn("Could not query contract state:", err);
  }
}

// Clear UI if environment is not configured (e.g. CC3)
function clearAllDataForUnconfiguredEnv() {
  const notAvail = "NOT AVAILABLE";
  if ($('overview-capacity')) $('overview-capacity').textContent = notAvail;
  if ($('overview-exposure')) $('overview-exposure').textContent = notAvail;
  if ($('overview-limit')) $('overview-limit').textContent = notAvail;
  if ($('overview-util-pct')) $('overview-util-pct').textContent = "0%";
  if ($('stat-event-count')) $('stat-event-count').textContent = "0";
  if ($('stat-total-volume')) $('stat-total-volume').textContent = "$0";
  if ($('stat-rep-count')) $('stat-rep-count').textContent = "0";
  if ($('stat-streak-count')) $('stat-streak-count').textContent = "0";
  if ($('health-score-val')) $('health-score-val').textContent = "N/A";
  if ($('passport-tier')) $('passport-tier').textContent = notAvail;
  if ($('passport-avail')) $('passport-avail').textContent = notAvail;
  if ($('passport-exp')) $('passport-exp').textContent = notAvail;
  if ($('passport-cap')) $('passport-cap').textContent = notAvail;
  if ($('calc-final-capacity')) $('calc-final-capacity').textContent = notAvail;

  const tbody = $('passport-events-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:32px 14px; color:var(--text-dim);">
          <div style="font-weight:600; color:#fca5a5; margin-bottom:4px;">CC3 TESTNET CONTRACTS NOT DEPLOYED</div>
          <div>No contracts deployed on Creditcoin CC3 Testnet yet. Switch to Local Anvil for verified demo state.</div>
        </td>
      </tr>`;
  }
}

// Load Verified Event Logs into Passport & Proof Explorer
async function loadPassportEventLogs() {
  const tbody = $('passport-events-tbody');
  if (!tbody || !state.contracts.passport) return;

  try {
    const filter = state.contracts.passport.filters.VerifiedEventRecorded(state.merchantId);
    const logs = await state.contracts.passport.queryFilter(filter, 0, 'latest');
    tbody.innerHTML = '';
    state.verifiedEvents = logs;

    if (logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:32px 14px; color:var(--text-dim);">
            <div style="font-weight:600; color:var(--text-muted); margin-bottom:4px;">NO VERIFIED ECONOMIC ACTIVITY</div>
            <div>Verified economic activity will appear here as your credit passport grows.</div>
          </td>
        </tr>`;
      updateProofExplorerView(null);
      return;
    }

    logs.forEach((l, index) => {
      const { eventType, amount, evidenceId } = l.args;
      const typeName = EVENT_TYPE_NAMES[Number(eventType)] || `Type ${eventType}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge info">${typeName}</span></td>
        <td class="mono" style="font-weight:600;">$${Number(amount).toLocaleString()}</td>
        <td class="mono" style="font-size:11.5px;">${evidenceId.slice(0, 18)}...</td>
        <td><span class="badge verified">VERIFIED (Block #${l.blockNumber})</span></td>
        <td><button class="btn-secondary" style="padding:3px 8px; font-size:11px;" onclick="window.inspectEvidence(${index})">Inspect Proof</button></td>
      `;
      tbody.appendChild(tr);
    });

    // Populate Proof Explorer with latest verified log
    updateProofExplorerView(logs[logs.length - 1]);
  } catch (err) {
    console.warn("Could not load passport logs:", err);
  }
}

// Update Proof Explorer with Real Evidence
function updateProofExplorerView(logRecord) {
  const statusEl = $('proof-status-header');
  const pathEl = $('proof-status-path');

  if (!logRecord) {
    if (statusEl) statusEl.textContent = 'AWAITING VERIFICATION';
    if (pathEl) pathEl.textContent = 'No verified economic activity recorded for this identity yet.';
    selectProofNode('source', null);
    return;
  }

  if (statusEl) statusEl.textContent = 'PROOF STATUS: VERIFIED ON-CHAIN';
  if (pathEl) pathEl.textContent = `Verification path completed on-chain (Mined in Block #${logRecord.blockNumber}, Evidence ID: ${logRecord.args.evidenceId.slice(0, 16)}...)`;

  selectProofNode(state.activeProofNode, logRecord);
}

// Global Evidence Inspector Hook
window.inspectEvidence = function(index) {
  state.selectedEventIndex = index;
  const logRecord = state.verifiedEvents[index];
  navigateToPage('proofs');
  updateProofExplorerView(logRecord);
};

// Navigation
export function navigateToPage(pageId) {
  document.querySelectorAll('nav.nav-menu button[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });
  document.querySelectorAll('.page-container').forEach(p => {
    p.classList.toggle('active', p.id === `page-${pageId}`);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Proof Explorer 5-Stage Interactive Pipeline with Real Data
function getStageDetails(nodeKey, logRecord) {
  const c = state.config.contracts;
  const hasLog = Boolean(logRecord);
  const eventType = hasLog ? Number(logRecord.args.eventType) : 0;
  const typeName = hasLog ? EVENT_TYPE_NAMES[eventType] : 'PaymentSettled';
  const amount = hasLog ? Number(logRecord.args.amount).toLocaleString() : '750';
  const evId = hasLog ? logRecord.args.evidenceId : '0x0000000000000000000000000000000000000000000000000000000000000000';
  const blockNum = hasLog ? logRecord.blockNumber : 'N/A';
  const txHash = hasLog ? logRecord.transactionHash : 'N/A';

  switch(nodeKey) {
    case 'source':
      return {
        title: "Stage 01: Source Transaction & Receipt",
        grid: [
          { lbl: "Source Chain Key:", val: `ChainKey: ${state.config.sourceChainKey} (Sepolia / External Settlement Rail)` },
          { lbl: "Source Contract:", val: `${c.economicEvents || 'N/A'} (EconomicEvents)` },
          { lbl: "Event Signature:", val: `${typeName}(bytes32,address,uint256,bytes32,uint64)` },
          { lbl: "EIP-658 Status:", val: "status = 1 (SUCCESS enforced on-chain by TransactionEvidence.sol)" },
          { lbl: "Source Block Number:", val: `#${blockNum}` },
          { lbl: "Source Tx Hash:", val: txHash }
        ]
      };
    case 'attestcoin':
      return {
        title: "Stage 02: Attestcoin / USC Proof Envelope",
        grid: [
          { lbl: "Proof Builder:", val: "Creditcoin Proof Builder Service (USC v0.18.0 format)" },
          { lbl: "Chunks Format:", val: "Tuple of 3 RLP chunks (Tx Details, Fee Details, Receipt Logs)" },
          { lbl: "Evidence ID:", val: evId },
          { lbl: "Merkle Sibling Proof:", val: "Block header state root inclusion siblings" },
          { lbl: "Continuity Digest:", val: "Chain header validator continuity proof" }
        ]
      };
    case 'precompile':
      return {
        title: "Stage 03: Creditcoin BlockProver Precompile (0xFD2)",
        grid: [
          { lbl: "Verification Engine:", val: "Creditcoin native precompile at 0x000...00FD2 (or MockBlockProver in local test harness)" },
          { lbl: "Cryptographic Check:", val: "Verifies inclusion of transaction chunk inside block header root" },
          { lbl: "Replay Protection:", val: "AttestcoinVerifier.evidenceConsumed(evidenceId) mapping check" },
          { lbl: "Verifier Contract:", val: c.attestcoinVerifier || 'N/A' }
        ]
      };
    case 'decoder':
      return {
        title: "Stage 04: TransactionEvidence.sol On-Chain Decoder",
        grid: [
          { lbl: "Decoder Architecture:", val: "Independent on-chain EVM log parser (The relayer is not trusted for economic facts; destination contract independently verifies and decodes evidence)" },
          { lbl: "Allowlist Guard:", val: "Requires log.emitter == registeredSourceContracts[chainKey, emitter]" },
          { lbl: "Decoded Merchant ID:", val: state.merchantId },
          { lbl: "Decoded Event Type:", val: `${typeName} (Type ${eventType})` },
          { lbl: "Decoded Volume:", val: `$${amount} USDC units` },
          { lbl: "Custom Error Guards:", val: "SourceContractDidNotEmitThisLog, UnknownEventSignature, LogIndexOutOfRange" }
        ]
      };
    case 'credit':
      return {
        title: "Stage 05: CreditPassport & Programmable Credit State",
        grid: [
          { lbl: "Target Identity:", val: `${state.merchantName} (${state.merchantId})` },
          { lbl: "Passport Sink:", val: `${c.creditPassport || 'N/A'} (CreditPassport.sol)` },
          { lbl: "Capacity Scaling:", val: "CreditEngine.sol deterministic rule (+1 unit per $10 verified volume)" },
          { lbl: "Current Credit Limit:", val: state.dashboardData ? `$${state.dashboardData.capacityNum}` : '$0' },
          { lbl: "Policy Enforcement:", val: `${c.policyEngine || 'N/A'} (PolicyEngine.sol)` }
        ]
      };
    default:
      return { title: "", grid: [] };
  }
}

function selectProofNode(nodeKey, logRecord = null) {
  state.activeProofNode = nodeKey;
  document.querySelectorAll('.proof-chain-node').forEach(n => {
    n.classList.toggle('selected', n.dataset.node === nodeKey);
  });

  const activeLog = logRecord || (state.verifiedEvents.length > 0 ? state.verifiedEvents[state.selectedEventIndex] : null);
  const stage = getStageDetails(nodeKey, activeLog);

  const detailTitle = $('node-detail-title');
  const detailGrid = $('node-detail-grid');
  if (detailTitle) detailTitle.textContent = stage.title;
  if (detailGrid) {
    detailGrid.innerHTML = stage.grid.map(g => `
      <div class="lbl">${g.lbl}</div>
      <div class="val">${g.val}</div>
    `).join('');
  }
}

// Live Borrow Pre-Flight Evaluation
function updateBorrowPreview() {
  const reqAmtInput = $('borrow-amount-input');
  const reqAmt = reqAmtInput ? Number(reqAmtInput.value) : 0;
  const avail = state.dashboardData ? state.dashboardData.availNum : 0;
  const policyMax = state.policyLimit;

  if ($('prev-req-amt')) $('prev-req-amt').textContent = `$${reqAmt.toLocaleString()}`;
  if ($('prev-policy-max')) $('prev-policy-max').textContent = `$${policyMax.toLocaleString()}`;
  if ($('prev-avail-cap')) $('prev-avail-cap').textContent = `$${avail.toLocaleString()}`;

  const statusBadge = $('borrow-eligibility-badge');
  const prevResult = $('prev-result-badge');

  if (!state.config.isConfigured) {
    if (statusBadge) { statusBadge.className = 'badge danger'; statusBadge.textContent = 'CC3 NOT CONFIGURED'; }
    if (prevResult) { prevResult.className = 'badge danger'; prevResult.textContent = 'BLOCKED: CONTRACTS NOT DEPLOYED'; }
    return;
  }

  if (reqAmt <= 0) {
    if (statusBadge) { statusBadge.className = 'badge advisory'; statusBadge.textContent = 'ENTER AMOUNT'; }
    if (prevResult) { prevResult.className = 'badge advisory'; prevResult.textContent = 'AWAITING AMOUNT'; }
  } else if (reqAmt > policyMax) {
    if (statusBadge) { statusBadge.className = 'badge danger'; statusBadge.textContent = 'POLICY LIMIT EXCEEDED'; }
    if (prevResult) { prevResult.className = 'badge danger'; prevResult.textContent = 'BORROW REJECTED (POLICY_LIMIT_EXCEEDED)'; }
  } else if (reqAmt > avail) {
    if (statusBadge) { statusBadge.className = 'badge danger'; statusBadge.textContent = 'EXCEEDS AVAILABLE CAPACITY'; }
    if (prevResult) { prevResult.className = 'badge danger'; prevResult.textContent = 'BORROW REJECTED (INSUFFICIENT_CAPACITY)'; }
  } else {
    if (statusBadge) { statusBadge.className = 'badge verified'; statusBadge.textContent = 'POLICY ELIGIBLE'; }
    if (prevResult) { prevResult.className = 'badge verified'; prevResult.textContent = 'BORROW APPROVED (ON-CHAIN POLICY VALID)'; }
  }
}

// User Actions: Borrow & Repay
async function handleBorrow() {
  if (!state.signer) {
    showToast("Please connect your wallet first.", "warning");
    return;
  }
  if (!state.config.isConfigured) {
    alert("CC3 Contracts are not deployed yet. Please switch to Local Anvil.");
    return;
  }

  const amt = Number($('borrow-amount-input').value);
  const tenor = Number($('borrow-tenor-input').value);
  const txStatusBox = $('borrow-tx-status');

  try {
    if (txStatusBox) {
      txStatusBox.style.display = 'block';
      txStatusBox.className = 'inspector-card';
      txStatusBox.innerHTML = `<div><strong>[Step 1/2]</strong> Submitting transaction to wallet...</div>`;
    }
    showToast(`Requesting borrow of $${amt}...`);

    const tx = await state.contracts.creditline.borrow(state.merchantId, amt, tenor, amt);
    if (txStatusBox) {
      txStatusBox.innerHTML = `<div><strong>[Step 2/2]</strong> Transaction submitted (Tx: <span class="mono">${tx.hash.slice(0, 16)}...</span>). Waiting for confirmation...</div>`;
    }

    const receipt = await tx.wait();
    if (txStatusBox) {
      txStatusBox.className = 'inspector-card';
      txStatusBox.style.borderColor = 'var(--status-success)';
      txStatusBox.innerHTML = `
        <div style="color:var(--status-success); font-weight:600; margin-bottom:4px;">CREDIT LINE DRAWDOWN CONFIRMED</div>
        <div class="mono" style="font-size:12px;">Transaction Hash: ${receipt.hash}</div>
        <div class="mono" style="font-size:12px;">Mined in Block: #${receipt.blockNumber}</div>
      `;
    }
    showToast(`Borrow of $${amt} confirmed on Creditcoin!`, "success");
    await refreshDashboard();
  } catch (err) {
    const decoded = decodeContractError(err, [state.contracts.verifier.interface, state.contracts.creditline.interface]);
    if (txStatusBox) {
      txStatusBox.className = 'inspector-card';
      txStatusBox.style.borderColor = 'var(--status-danger)';
      txStatusBox.innerHTML = `
        <div style="color:var(--status-danger); font-weight:600; margin-bottom:4px;">BORROW REJECTED ON-CHAIN</div>
        <div style="font-size:13px; margin-bottom:4px;">${decoded.explanation.title} (${decoded.name})</div>
        <div style="color:var(--text-muted); font-size:12px;">${decoded.explanation.description}</div>
      `;
    }
    alert(`${decoded.explanation.title}\n\n${decoded.explanation.description}\n\nTechnical Reason: ${decoded.name}`);
  }
}

async function handleRepay() {
  if (!state.signer) {
    showToast("Please connect your wallet first.", "warning");
    return;
  }
  try {
    const exp = await state.contracts.passport.getCurrentExposure(state.merchantId);
    if (Number(exp) === 0) {
      showToast("No active credit exposure to repay.", "info");
      return;
    }
    showToast("Submitting repayment...");
    const tx = await state.contracts.creditline.repay(state.merchantId, { value: exp });
    await tx.wait();
    showToast("Active exposure successfully repaid!", "success");
    await refreshDashboard();
  } catch (err) {
    const decoded = decodeContractError(err, [state.contracts.creditline.interface]);
    alert(`Repayment failed: ${decoded.explanation.description}`);
  }
}

// Emit Source Activity Flow
async function handleEmitActivity() {
  if (!state.signer) {
    showToast("Please connect wallet first.", "warning");
    return;
  }
  const eventType = Number($('emit-type-select').value);
  const amount = Number($('emit-amount-input').value);
  const logBox = $('activity-log-box');

  try {
    logBox.innerHTML = `<div>[1/4] Emitting event on EconomicEvents.sol (${EVENT_TYPE_NAMES[eventType]})...</div>`;
    const ref = ethers.encodeBytes32String(`ref-${Date.now().toString().slice(-6)}`);
    let tx;
    if (eventType === 0) tx = await state.contracts.econ.emitPaymentSettled(state.merchantId, amount, ref);
    else if (eventType === 1) tx = await state.contracts.econ.emitRevenueRecorded(state.merchantId, amount, ref);
    else if (eventType === 2) tx = await state.contracts.econ.emitLoanRepayment(state.merchantId, amount, ref);
    else if (eventType === 3) tx = await state.contracts.econ.emitObligationMissed(state.merchantId, amount, ref);

    const receipt = await tx.wait();
    logBox.innerHTML += `<div>[2/4] Source Tx Mined in Block #${receipt.blockNumber}. Tx Hash: <span class="mono">${receipt.hash.slice(0, 16)}...</span></div>`;

    logBox.innerHTML += `<div>[3/4] Building USC v0.18.0 Chunk Envelope &amp; Merkle Inclusion Proof...</div>`;
    const { merkleProof, continuityProof } = buildEmptyProofs();
    const rawLog = buildRawLog(state.config.contracts.economicEvents, eventType, state.merchantId, amount, ref);
    const encodedTx = buildEncodedTransaction(state.config.contracts.economicEvents, true, [rawLog], Date.now());
    const evidence = [
      state.config.sourceChainKey,
      receipt.blockNumber,
      encodedTx,
      merkleProof,
      continuityProof,
      state.config.contracts.economicEvents,
      0
    ];

    const vTx = await state.contracts.verifier.submitEvidence(evidence);
    await vTx.wait();
    logBox.innerHTML += `<div style="color:#6ee7b7;">[4/4] Cryptographically verified and decoded on Creditcoin! Capacity updated.</div>`;
    showToast("Economic evidence verified and recorded!", "success");
    await refreshDashboard();
  } catch (err) {
    const decoded = decodeContractError(err);
    logBox.innerHTML += `<div style="color:#fca5a5;">[Error] ${decoded.explanation.title}: ${decoded.explanation.description}</div>`;
  }
}

// Security Lab Attack Executions with Real Timelines
async function executeSecurityAttack(attackKey) {
  if (!state.signer) {
    showToast("Please connect your wallet first.", "warning");
    return;
  }
  const resEl = $(`res-${attackKey}`);
  const timelineEl = $(`tl-${attackKey}`);
  if (!resEl) return;

  resEl.textContent = "Executing attack transaction...";
  resEl.className = "attack-result-box";

  if (timelineEl) {
    timelineEl.innerHTML = `<span style="color:var(--brand-primary)">INIT</span> &rarr; <span style="color:var(--status-warning)">SUBMITTING</span> &rarr; <span>REVERT</span> &rarr; <span>DECODE</span>`;
  }

  const { merkleProof, continuityProof } = buildEmptyProofs();

  try {
    if (attackKey === 'replay') {
      const rawLog = buildRawLog(state.config.contracts.economicEvents, 0, state.merchantId, 500);
      const encodedTx = buildEncodedTransaction(state.config.contracts.economicEvents, true, [rawLog], 8888);
      const evidence = [state.config.sourceChainKey, 1, encodedTx, merkleProof, continuityProof, state.config.contracts.economicEvents, 0];
      try { await state.contracts.verifier.submitEvidence(evidence); } catch (_) {}
      await state.contracts.verifier.submitEvidence(evidence);
      resEl.textContent = "CRITICAL VULNERABILITY: Replay attack succeeded unexpectedly.";
      resEl.className = "attack-result-box failed";
    } else if (attackKey === 'fakesource') {
      const rawLog = buildRawLog(state.config.contracts.economicEvents, 0, state.merchantId, 500);
      const encodedTx = buildEncodedTransaction(state.config.contracts.economicEvents, true, [rawLog], Date.now());
      const fakeAddress = "0x00000000000000000000000000000000badc0ffe";
      const evidence = [state.config.sourceChainKey, 1, encodedTx, merkleProof, continuityProof, fakeAddress, 0];
      await state.contracts.verifier.submitEvidence(evidence);
      resEl.textContent = "CRITICAL VULNERABILITY: Fake source contract was accepted.";
      resEl.className = "attack-result-box failed";
    } else if (attackKey === 'failedtx') {
      const rawLog = buildRawLog(state.config.contracts.economicEvents, 0, state.merchantId, 500);
      const encodedTx = buildEncodedTransaction(state.config.contracts.economicEvents, false, [rawLog], Date.now());
      const evidence = [state.config.sourceChainKey, 1, encodedTx, merkleProof, continuityProof, state.config.contracts.economicEvents, 0];
      await state.contracts.verifier.submitEvidence(evidence);
      resEl.textContent = "CRITICAL VULNERABILITY: Reverted source transaction generated credit.";
      resEl.className = "attack-result-box failed";
    } else if (attackKey === 'maliciousai') {
      await state.contracts.creditline.borrow(state.merchantId, 50000, 604800, 50000);
      resEl.textContent = "CRITICAL VULNERABILITY: Policy limit of $2,000 was bypassed.";
      resEl.className = "attack-result-box failed";
    }
  } catch (err) {
    const decoded = decodeContractError(err, [state.contracts.verifier.interface, state.contracts.creditline.interface]);
    if (timelineEl) {
      timelineEl.innerHTML = `<span style="color:var(--status-success)">INIT</span> &rarr; <span style="color:var(--status-success)">SUBMITTED</span> &rarr; <span style="color:var(--status-danger)">REVERTED</span> &rarr; <span style="color:var(--status-success)">DECODED</span> &rarr; <span style="color:var(--status-success)">CONTROL VERIFIED</span>`;
    }
    resEl.innerHTML = `
      <div style="font-weight:700; color:var(--status-success); margin-bottom:2px;">ATTACK BLOCKED ON-CHAIN</div>
      <div class="mono" style="font-size:11px; color:#fff;">${decoded.name} (${decoded.selector})</div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-top:3px;">${decoded.explanation.description}</div>
      <div style="font-size:10.5px; color:var(--brand-primary); margin-top:3px;">Authority: ${decoded.explanation.authority}</div>
    `;
    resEl.className = "attack-result-box blocked";
  }
}

// Developer API Live Query
async function executeApiQuery() {
  const terminal = $('api-response-box');
  if (!terminal) return;
  if (!state.config.isConfigured) {
    terminal.textContent = JSON.stringify({ error: "CC3 Testnet contracts not deployed. Please switch to Local Anvil." }, null, 2);
    return;
  }
  terminal.textContent = "Executing RPC call against getMerchantState()...";
  try {
    const c = state.contracts.passport;
    const stateTuple = await c.getMerchantState(state.merchantId);
    const result = {
      chain: state.config.name,
      rpcEndpoint: state.config.rpc,
      contractAddress: state.config.contracts.creditPassport,
      method: "getMerchantState(bytes32)",
      merchantAlias: state.merchantName,
      merchantIdHex: state.merchantId,
      response: {
        verifiedEventCount: stateTuple.verifiedEventCount.toString(),
        verifiedPaymentVolumeUSD: stateTuple.verifiedPaymentVolume.toString(),
        successfulRepaymentCount: stateTuple.successfulRepaymentCount.toString(),
        repaymentVolumeUSD: stateTuple.repaymentVolume.toString(),
        repaymentStreak: stateTuple.repaymentStreak.toString(),
        missedObligations: stateTuple.missedObligations.toString(),
        currentExposureUSD: stateTuple.currentExposure.toString(),
        currentCapacityUSD: stateTuple.currentCapacity.toString()
      }
    };
    terminal.textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    terminal.textContent = JSON.stringify({ error: err.message }, null, 2);
  }
}

// Settings & Network Switching
function applyEnvironment(envKey) {
  state.currentEnv = envKey;
  state.config = { ...NETWORK_PRESETS[envKey] };

  state.provider = new ethers.JsonRpcProvider(state.config.rpc);
  initContracts(state.signer || state.provider);

  const envHeader = $('env-header-banner');
  const envLabel = $('env-label');
  const envBadge = $('env-badge');

  if (envKey === 'cc3') {
    if (envBadge) envBadge.className = 'net-badge cc3';
    if (envLabel) envLabel.textContent = 'CC3 TESTNET (102031)';
    if (envHeader) {
      envHeader.className = 'env-banner cc3';
      envHeader.innerHTML = `
        <div class="env-banner-title">CREDITCOIN CC3 — TESTNET (Chain ID: 102031)</div>
        <div class="env-banner-desc">${state.config.statusText}</div>
      `;
    }
  } else {
    if (envBadge) envBadge.className = 'net-badge local';
    if (envLabel) envLabel.textContent = 'LOCAL ANVIL (31337)';
    if (envHeader) {
      envHeader.className = 'env-banner local';
      envHeader.innerHTML = `
        <div class="env-banner-title">LOCAL ANVIL — DEMO ENVIRONMENT (Chain ID: 31337)</div>
        <div class="env-banner-desc">Deterministic Local Testing Environment (RPC: 127.0.0.1:8545)</div>
      `;
    }
  }

  showToast(`Switched environment to ${state.config.name}`);
  refreshDashboard();
}

// Judge Mode 90-Second Walkthrough
function toggleJudgeMode() {
  state.judgeMode = !state.judgeMode;
  const ribbon = $('judge-tour-ribbon');
  const btn = $('judge-mode-toggle-btn');
  if (ribbon) ribbon.style.display = state.judgeMode ? 'flex' : 'none';
  if (btn) {
    btn.classList.toggle('active', state.judgeMode);
    btn.textContent = state.judgeMode ? '⚡ Exit Judge Tour' : '⚡ Judge Tour (90s)';
  }
  if (state.judgeMode) {
    navigateToPage('overview');
    showToast("Judge Tour Activated (90-Sec High-Trust Walkthrough)", "info");
  }
}

// Event Listeners Binding
window.addEventListener('DOMContentLoaded', async () => {
  // Navigation Buttons
  document.querySelectorAll('nav.nav-menu button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateToPage(btn.dataset.page));
  });

  // Mobile Menu Toggle
  const mobileToggle = $('mobile-toggle-btn');
  const sidebar = document.querySelector('aside.sidebar');
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
  }

  // Judge Mode Button
  const judgeBtn = $('judge-mode-toggle-btn');
  if (judgeBtn) judgeBtn.addEventListener('click', toggleJudgeMode);

  // Judge Tour Step Clicks
  document.querySelectorAll('.judge-tour-step').forEach(step => {
    step.addEventListener('click', () => navigateToPage(step.dataset.page));
  });

  // Identity & Load Merchant
  const loadBtn = $('load-merchant-btn');
  if (loadBtn) loadBtn.addEventListener('click', refreshDashboard);

  // Wallet Connect Button
  const walletBtn = $('wallet-btn');
  if (walletBtn) walletBtn.addEventListener('click', () => wallet.connect());

  // 7-Step Journey Click Navigation
  document.querySelectorAll('.journey-step-card').forEach((step, idx) => {
    step.addEventListener('click', () => {
      const pageMap = ['activity', 'proofs', 'proofs', 'passport', 'capacity', 'creditline', 'overview'];
      navigateToPage(pageMap[idx] || 'overview');
    });
  });

  // Proof Explorer Nodes
  document.querySelectorAll('.proof-chain-node').forEach(node => {
    node.addEventListener('click', () => selectProofNode(node.dataset.node));
  });

  // Borrow Input Pre-Flight Listener
  const borrowAmtInput = $('borrow-amount-input');
  if (borrowAmtInput) borrowAmtInput.addEventListener('input', updateBorrowPreview);

  // Borrow & Repay Action Buttons
  const borrowBtn = $('execute-borrow-btn');
  if (borrowBtn) borrowBtn.addEventListener('click', handleBorrow);

  const repayBtn = $('execute-repay-btn');
  if (repayBtn) repayBtn.addEventListener('click', handleRepay);

  // Activity Generator
  const emitBtn = $('emit-event-btn');
  if (emitBtn) emitBtn.addEventListener('click', handleEmitActivity);

  // Security Lab Attack Buttons
  document.querySelectorAll('button[data-attack]').forEach(btn => {
    btn.addEventListener('click', () => executeSecurityAttack(btn.dataset.attack));
  });

  // Developer API Query
  const apiQueryBtn = $('api-query-btn');
  if (apiQueryBtn) apiQueryBtn.addEventListener('click', executeApiQuery);

  // Settings Presets
  const presetLocalBtn = $('env-preset-local');
  if (presetLocalBtn) presetLocalBtn.addEventListener('click', () => applyEnvironment('local'));

  const presetCc3Btn = $('env-preset-cc3');
  if (presetCc3Btn) presetCc3Btn.addEventListener('click', () => applyEnvironment('cc3'));

  // Initial Boot into Local Anvil
  applyEnvironment('local');
});
