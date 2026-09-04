// frontend/js/app.js - Main Application Orchestrator for Kasuwa Credit OS

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
  activeProofNode: 'source'
};

// UI Elements Helper
const $ = (id) => document.getElementById(id);

// Toast Notification
export function showToast(message, type = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// Initialize Contracts
function initContracts(runner) {
  const c = state.config.contracts;
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
    showToast(`Connected: ${wState.address.slice(0, 6)}...${wState.address.slice(-4)}`);
    initContracts(state.signer);
  } else if (wState.status === 'DISCONNECTED') {
    state.signer = null;
    state.walletAddress = null;
    btn.textContent = 'Connect Wallet';
    btn.classList.remove('connected');
    initContracts(state.provider);
  }
});

// Load Dashboard & Contract State
export async function refreshDashboard() {
  state.merchantName = $('merchant-input').value.trim() || 'merchant-1';
  state.merchantId = ethers.encodeBytes32String(state.merchantName);

  if ($('passport-id-hex')) $('passport-id-hex').textContent = state.merchantId;

  // Check if contracts are configured
  if (!state.config.contracts.creditPassport || state.config.contracts.creditPassport === '') {
    if ($('overview-capacity')) $('overview-capacity').textContent = '0';
    if ($('passport-tier')) $('passport-tier').textContent = 'CC3 Contracts Not Deployed';
    return;
  }

  try {
    const c = state.contracts;
    const [cap, tier, exp, avail, activity, repHistory] = await Promise.all([
      c.passport.getCreditCapacity(state.merchantId),
      c.passport.getCreditTier(state.merchantId),
      c.passport.getCurrentExposure(state.merchantId),
      c.passport.getAvailableCredit(state.merchantId),
      c.passport.getVerifiedEconomicActivity(state.merchantId),
      c.passport.getRepaymentHistory(state.merchantId)
    ]);

    const capacityNum = Number(cap);
    const exposureNum = Number(exp);
    const availNum = Number(avail);

    state.dashboardData = { capacityNum, exposureNum, availNum, tier: Number(tier), activity, repHistory };

    // Overview numbers
    if ($('overview-capacity')) $('overview-capacity').textContent = capacityNum.toLocaleString();
    if ($('overview-exposure')) $('overview-exposure').textContent = exposureNum.toLocaleString();
    if ($('overview-limit')) $('overview-limit').textContent = capacityNum.toLocaleString();

    const utilPct = capacityNum > 0 ? Math.min(100, Math.round((exposureNum / capacityNum) * 100)) : 0;
    if ($('overview-util-pct')) $('overview-util-pct').textContent = `${utilPct}%`;
    if ($('overview-progress-bar')) $('overview-progress-bar').style.width = `${utilPct}%`;

    // Circular gauge offset: circumference = 251.2
    if ($('gauge-circle')) {
      const offset = 251.2 - (251.2 * utilPct / 100);
      $('gauge-circle').style.strokeDashoffset = offset;
    }

    // KPI Stat Tiles
    if ($('stat-event-count')) $('stat-event-count').textContent = activity.eventCount.toString();
    if ($('stat-total-volume')) $('stat-total-volume').textContent = `$${Number(activity.paymentVolume).toLocaleString()}`;
    if ($('stat-rep-count')) $('stat-rep-count').textContent = repHistory.count.toString();
    if ($('stat-streak-count')) $('stat-streak-count').textContent = repHistory.streak.toString();

    // Credit Health Score (out of 100)
    const volPts = Math.min(30, Math.round(Number(activity.paymentVolume) / 50));
    const repPts = Math.min(30, Number(repHistory.count) * 10);
    const streakPts = Math.min(25, Number(repHistory.streak) * 5);
    const missedPenalty = Number(repHistory.missed) * 20;
    const totalScore = Math.max(0, Math.min(100, volPts + repPts + streakPts - missedPenalty));

    if ($('health-score-val')) $('health-score-val').textContent = totalScore;
    if ($('health-vol-score')) $('health-vol-score').textContent = `+${volPts} pts`;
    if ($('health-rep-score')) $('health-rep-score').textContent = `+${repPts} pts`;
    if ($('health-streak-score')) $('health-streak-score').textContent = `+${streakPts} pts`;
    if ($('health-missed-score')) $('health-missed-score').textContent = `-${missedPenalty} pts`;
    if ($('health-tier-badge')) $('health-tier-badge').textContent = `Tier ${tier}`;

    // Passport page
    if ($('passport-tier')) $('passport-tier').textContent = `Tier ${tier}`;
    if ($('passport-avail')) $('passport-avail').textContent = `$${availNum.toLocaleString()}`;
    if ($('passport-exp')) $('passport-exp').textContent = `$${exposureNum.toLocaleString()}`;

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

    // Load Passport Activity Logs
    await loadPassportEventLogs();
  } catch (err) {
    console.warn("Could not query contract state:", err);
  }
}

// Load Verified Event Logs into Passport & Proof Explorer
async function loadPassportEventLogs() {
  const tbody = $('passport-events-tbody');
  if (!tbody) return;

  try {
    const filter = state.contracts.passport.filters.VerifiedEventRecorded(state.merchantId);
    const logs = await state.contracts.passport.queryFilter(filter, 0, 'latest');
    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:32px 14px; color:var(--text-dim);">
            <div style="font-weight:600; color:var(--text-muted); margin-bottom:4px;">NO VERIFIED ECONOMIC ACTIVITY</div>
            <div>Verified economic activity will appear here as your credit passport grows.</div>
          </td>
        </tr>`;
      return;
    }

    for (const l of logs) {
      const { eventType, amount, evidenceId } = l.args;
      const typeName = EVENT_TYPE_NAMES[Number(eventType)] || `Type ${eventType}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge info">${typeName}</span></td>
        <td class="mono" style="font-weight:600;">$${Number(amount).toLocaleString()}</td>
        <td class="mono" style="font-size:11.5px;">${evidenceId.slice(0, 18)}...</td>
        <td><span class="badge verified">VERIFIED</span></td>
        <td><button class="btn-secondary" style="padding:3px 8px; font-size:11px;" onclick="window.inspectEvidence('${evidenceId}', '${typeName}', ${amount})">Inspect Trace</button></td>
      `;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.warn("Could not load passport logs:", err);
  }
}

// Global Evidence Inspector
window.inspectEvidence = function(evidenceId, typeName, amount) {
  // Navigate to proofs page
  navigateToPage('proofs');

  const detailTitle = $('node-detail-title');
  const detailGrid = $('node-detail-grid');
  if (detailTitle) detailTitle.textContent = `Evidence Trace: ${typeName} ($${amount})`;
  if (detailGrid) {
    detailGrid.innerHTML = `
      <div class="lbl">Evidence Identifier:</div><div class="val">${evidenceId}</div>
      <div class="lbl">Decoded Event:</div><div class="val">${typeName}</div>
      <div class="lbl">Decoded Volume:</div><div class="val">${amount} Units</div>
      <div class="lbl">Source Verification:</div><div class="val">Cryptographically validated by AttestcoinVerifier.sol</div>
      <div class="lbl">On-Chain State:</div><div class="val">Recorded into CreditPassport.sol</div>
    `;
  }
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

// Proof Explorer 5-Stage Interactive Pipeline
const PROOF_STAGES = {
  source: {
    title: "Stage 01: Source Transaction & Receipt",
    grid: [
      { lbl: "Source Chain:", val: "Sepolia / External Settlement Rail (ChainKey: 2)" },
      { lbl: "Source Contract:", val: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e (EconomicEvents)" },
      { lbl: "Event Signature:", val: "PaymentSettled(bytes32,address,uint256,bytes32,uint64)" },
      { lbl: "EIP-658 Status:", val: "status = 1 (SUCCESS enforced on-chain)" }
    ]
  },
  attestcoin: {
    title: "Stage 02: Attestcoin / USC Proof Envelope",
    grid: [
      { lbl: "Proof Builder:", val: "Creditcoin Proof Builder Service (v0.18.0 format)" },
      { lbl: "Chunks Format:", val: "Tuple of 3 RLP chunks (Tx Details, Fee Details, Receipt Logs)" },
      { lbl: "Merkle Proof:", val: "Block header state root sibling hashes" },
      { lbl: "Continuity Proof:", val: "Chain header validator digest" }
    ]
  },
  precompile: {
    title: "Stage 03: Creditcoin BlockProver Precompile (0xFD2)",
    grid: [
      { lbl: "Verification Engine:", val: "Creditcoin native precompile at 0x000...00FD2" },
      { lbl: "Cryptographic Check:", val: "Verifies inclusion of transaction chunk inside block header root" },
      { lbl: "Replay Protection:", val: "attestcoinVerifier.evidenceConsumed(evidenceId) check" }
    ]
  },
  decoder: {
    title: "Stage 04: TransactionEvidence.sol Decoder",
    grid: [
      { lbl: "Decoder Architecture:", val: "Independent on-chain EVM log parser (Zero Relayer Trust)" },
      { lbl: "Decoupled Emitter:", val: "Requires log.emitter == registeredSourceContract" },
      { lbl: "Decoded Fields:", val: "merchantId, eventType, amount, ref, timestamp" },
      { lbl: "Revert Guards:", val: "SourceContractDidNotEmitThisLog, UnknownEventSignature, LogIndexOutOfRange" }
    ]
  },
  credit: {
    title: "Stage 05: CreditPassport & Programmable Credit State",
    grid: [
      { lbl: "State Destination:", val: "CreditPassport.sol (Persistent Economic Identity)" },
      { lbl: "Capacity Calculation:", val: "CreditEngine.sol deterministic formula (+1 unit per $10 volume)" },
      { lbl: "Credit Line Access:", val: "Immediate borrowing eligibility under PolicyEngine rules" }
    ]
  }
};

function selectProofNode(nodeKey) {
  state.activeProofNode = nodeKey;
  document.querySelectorAll('.proof-chain-node').forEach(n => {
    n.classList.toggle('selected', n.dataset.node === nodeKey);
  });

  const stage = PROOF_STAGES[nodeKey] || PROOF_STAGES.source;
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

// User Actions: Borrow & Repay
async function handleBorrow() {
  if (!state.signer) {
    showToast("Please connect your wallet first.", "warning");
    return;
  }
  const amt = Number($('borrow-amount-input').value);
  const tenor = Number($('borrow-tenor-input').value);

  try {
    showToast(`Requesting credit drawdown of $${amt}...`);
    const tx = await state.contracts.creditline.borrow(state.merchantId, amt, tenor, amt);
    await tx.wait();
    showToast(`Borrow of $${amt} confirmed on Creditcoin!`, "success");
    await refreshDashboard();
  } catch (err) {
    const decoded = decodeContractError(err, [state.contracts.verifier.interface, state.contracts.creditline.interface]);
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
    logBox.innerHTML = `<div>[1/3] Emitting event on EconomicEvents.sol (${EVENT_TYPE_NAMES[eventType]})...</div>`;
    const ref = ethers.encodeBytes32String(`ref-${Date.now().toString().slice(-6)}`);
    let tx;
    if (eventType === 0) tx = await state.contracts.econ.emitPaymentSettled(state.merchantId, amount, ref);
    else if (eventType === 1) tx = await state.contracts.econ.emitRevenueRecorded(state.merchantId, amount, ref);
    else if (eventType === 2) tx = await state.contracts.econ.emitLoanRepayment(state.merchantId, amount, ref);
    else if (eventType === 3) tx = await state.contracts.econ.emitObligationMissed(state.merchantId, amount, ref);

    const receipt = await tx.wait();
    logBox.innerHTML += `<div>[2/3] Source Tx Mined (Block #${receipt.blockNumber}). Packaging USC evidence...</div>`;

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
    logBox.innerHTML += `<div style="color:#6ee7b7;">[3/3] Verified on-chain into CreditPassport! Capacity updated.</div>`;
    showToast("Economic evidence verified and recorded!", "success");
    await refreshDashboard();
  } catch (err) {
    const decoded = decodeContractError(err);
    logBox.innerHTML += `<div style="color:#fca5a5;">[Error] ${decoded.explanation.title}: ${decoded.explanation.description}</div>`;
  }
}

// Security Lab Attack Executions
async function executeSecurityAttack(attackKey) {
  if (!state.signer) {
    showToast("Please connect your wallet first.", "warning");
    return;
  }
  const resEl = $(`res-${attackKey}`);
  if (!resEl) return;
  resEl.textContent = "Executing attack transaction...";
  resEl.className = "attack-result-box";

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
    resEl.textContent = `BLOCKED: ${decoded.name} — ${decoded.explanation.title}`;
    resEl.className = "attack-result-box blocked";
  }
}

// Developer API Live Query
async function executeApiQuery() {
  const terminal = $('api-response-box');
  if (!terminal) return;
  terminal.textContent = "Executing RPC query...";
  try {
    const c = state.contracts.passport;
    const stateTuple = await c.getMerchantState(state.merchantId);
    const result = {
      merchantId: state.merchantId,
      merchantAlias: state.merchantName,
      verifiedEventCount: stateTuple.verifiedEventCount.toString(),
      verifiedPaymentVolume: stateTuple.verifiedPaymentVolume.toString(),
      successfulRepaymentCount: stateTuple.successfulRepaymentCount.toString(),
      repaymentVolume: stateTuple.repaymentVolume.toString(),
      repaymentStreak: stateTuple.repaymentStreak.toString(),
      missedObligations: stateTuple.missedObligations.toString(),
      currentExposure: stateTuple.currentExposure.toString(),
      currentCapacity: stateTuple.currentCapacity.toString()
    };
    terminal.textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    terminal.textContent = `Error executing query: ${err.message}`;
  }
}

// Settings & Network Presets
function applyEnvironment(envKey) {
  state.currentEnv = envKey;
  state.config = { ...NETWORK_PRESETS[envKey] };

  state.provider = new ethers.JsonRpcProvider(state.config.rpc);
  initContracts(state.signer || state.provider);

  const badge = $('env-badge');
  const label = $('env-label');
  if (envKey === 'cc3') {
    if (badge) badge.className = 'net-badge cc3';
    if (label) label.textContent = 'CC3 TESTNET (102031)';
  } else {
    if (badge) badge.className = 'net-badge local';
    if (label) label.textContent = 'LOCAL ANVIL (31337)';
  }

  showToast(`Switched network to ${state.config.name}`);
  refreshDashboard();
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

  // Borrow & Repay
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

  // Initial Boot
  applyEnvironment('local');
});
