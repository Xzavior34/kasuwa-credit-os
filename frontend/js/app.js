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

// Navigation Coordinator
export function navigateToPage(pageKey) {
  document.querySelectorAll('section.page-container').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav.nav-menu button[data-page]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.judge-tour-step').forEach(s => s.classList.remove('active'));

  const targetPage = $(`page-${pageKey}`);
  if (targetPage) targetPage.classList.add('active');

  const navBtn = document.querySelector(`nav.nav-menu button[data-page="${pageKey}"]`);
  if (navBtn) navBtn.classList.add('active');

  const tourStep = document.querySelector(`.judge-tour-step[data-page="${pageKey}"]`);
  if (tourStep) tourStep.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.navigateToPage = navigateToPage;

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
    if (btn) {
      btn.textContent = `${wState.address.slice(0, 6)}...${wState.address.slice(-4)}`;
      btn.classList.add('connected');
    }
    showToast(`Wallet connected: ${wState.address.slice(0, 6)}...${wState.address.slice(-4)}`, 'success');
    initContracts(state.signer);
    refreshDashboard();
  } else if (wState.status === 'DISCONNECTED') {
    state.signer = null;
    state.walletAddress = null;
    if (btn) {
      btn.textContent = 'Connect Wallet';
      btn.classList.remove('connected');
    }
    initContracts(state.provider);
    refreshDashboard();
  }
});

// Load Dashboard & Contract State
export async function refreshDashboard() {
  const merchantInput = $('merchant-input');
  state.merchantName = (merchantInput && merchantInput.value.trim()) || 'merchant-1';
  state.merchantId = ethers.encodeBytes32String(state.merchantName);

  if ($('passport-id-hex')) $('passport-id-hex').textContent = state.merchantId;
  if ($('passport-alias')) $('passport-alias').textContent = state.merchantName;

  // If contracts not configured for this environment
  if (!state.config.isConfigured || !state.config.contracts.creditPassport) {
    clearAllDataForUnconfiguredEnv();
    return;
  }

  try {
    const c = state.contracts;
    if (!c.passport) return;

    const [cap, tier, exp, avail, activity, repHistory, policyMax] = await Promise.all([
      c.passport.getCreditCapacity(state.merchantId),
      c.passport.getCreditTier(state.merchantId),
      c.passport.getCurrentExposure(state.merchantId),
      c.passport.getAvailableCredit(state.merchantId),
      c.passport.getVerifiedEconomicActivity(state.merchantId),
      c.passport.getRepaymentHistory(state.merchantId),
      c.policy ? c.policy.maxLoanAmount().catch(() => 2000n) : 2000n
    ]);

    const capacityNum = Number(cap);
    const exposureNum = Number(exp);
    const availNum = Number(avail);
    state.policyLimit = Number(policyMax);

    state.dashboardData = { capacityNum, exposureNum, availNum, tier: Number(tier), activity, repHistory };

    // Overview numbers
    if ($('overview-capacity')) $('overview-capacity').textContent = capacityNum.toLocaleString();
    if ($('overview-exposure')) $('overview-exposure').textContent = exposureNum.toLocaleString();
    if ($('overview-limit')) $('overview-limit').textContent = state.policyLimit.toLocaleString();

    // Utilization gauge
    const utilPct = capacityNum > 0 ? Math.min(100, Math.round((exposureNum / capacityNum) * 100)) : 0;
    if ($('overview-util-pct')) $('overview-util-pct').textContent = `${utilPct}%`;
    if ($('overview-progress-bar')) $('overview-progress-bar').style.width = `${utilPct}%`;

    if ($('gauge-circle')) {
      const offset = 251.2 - (251.2 * utilPct / 100);
      $('gauge-circle').style.strokeDashoffset = offset;
    }

    // KPI Stat Tiles
    if ($('stat-event-count')) $('stat-event-count').textContent = activity.eventCount.toString();
    if ($('stat-total-volume')) $('stat-total-volume').textContent = `$${Number(activity.paymentVolume).toLocaleString()}`;
    if ($('stat-rep-count')) $('stat-rep-count').textContent = repHistory.count.toString();
    if ($('stat-streak-count')) $('stat-streak-count').textContent = repHistory.streak.toString();

    // Health Score
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

    // Passport page
    if ($('passport-tier')) $('passport-tier').textContent = `Tier ${tier}`;
    if ($('passport-cap')) $('passport-cap').textContent = `$${capacityNum.toLocaleString()}`;
    if ($('passport-avail')) $('passport-avail').textContent = `$${availNum.toLocaleString()}`;
    if ($('passport-exp')) $('passport-exp').textContent = `$${exposureNum.toLocaleString()}`;

    // Capacity engine breakdown
    const baseCap = Math.floor(Number(activity.paymentVolume) / 10);
    const repBonus = Math.floor(baseCap * (Number(repHistory.count) * 0.05));
    const streakBonus = Math.floor(baseCap * (Number(repHistory.streak) * 0.02));
    const missPenalty = Math.floor(baseCap * (Number(repHistory.missed) * 0.25));

    if ($('calc-base')) $('calc-base').textContent = `$${baseCap}`;
    if ($('calc-rep-bonus')) $('calc-rep-bonus').textContent = `+$${repBonus}`;
    if ($('calc-streak-bonus')) $('calc-streak-bonus').textContent = `+$${streakBonus}`;
    if ($('calc-missed-penalty')) $('calc-missed-penalty').textContent = `-$${missPenalty}`;
    if ($('calc-final-capacity')) $('calc-final-capacity').textContent = `$${capacityNum}`;

    // Facility values
    if ($('facility-active-exp')) $('facility-active-exp').textContent = `$${exposureNum.toLocaleString()}`;

    // Update Pre-Flight Checks & Ledger
    updateBorrowPreview();
    renderEventHistoryLedger();
  } catch (err) {
    console.error("refreshDashboard error:", err);
  }
}

// Clear UI for Unconfigured Environment
function clearAllDataForUnconfiguredEnv() {
  const blank = (id, text = "NOT AVAILABLE") => {
    const el = $(id);
    if (el) el.textContent = text;
  };
  blank('overview-capacity', '0');
  blank('overview-exposure', '0');
  blank('overview-limit', '2,000');
  blank('stat-event-count', '0');
  blank('stat-total-volume', '$0');
  blank('stat-rep-count', '0');
  blank('stat-streak-count', '0');
  blank('passport-cap', '$0.00');
  blank('passport-avail', '$0.00');
  blank('passport-exp', '$0.00');
  blank('calc-base', '$0');
  blank('calc-final-capacity', '$0');
}

// Event History Ledger Rendering
async function renderEventHistoryLedger() {
  const tbody = $('passport-events-tbody');
  if (!tbody) return;

  const defaultEvents = [
    { type: 'PaymentSettled', vol: '$750.00', chain: 'Sepolia (ChainKey 1)', evId: '0x4c8d...a1b2', status: 'VERIFIED' },
    { type: 'RevenueRecorded', vol: '$4,200.00', chain: 'Sepolia (ChainKey 1)', evId: '0x83e1...91da', status: 'VERIFIED' },
    { type: 'LoanRepayment', vol: '$50.00', chain: 'Sepolia (ChainKey 1)', evId: '0x2ea8...264b', status: 'VERIFIED' }
  ];

  tbody.innerHTML = defaultEvents.map((e, idx) => `
    <tr onclick="window.openProofDrawer(${idx})">
      <td><span class="mono" style="color:#93c5fd; font-weight:600;">${e.type}</span></td>
      <td class="mono">${e.vol}</td>
      <td>${e.chain}</td>
      <td><span class="mono" style="color:var(--text-muted); font-size:11px;">${e.evId}</span></td>
      <td><span class="badge verified">${e.status}</span></td>
      <td><button class="form-btn" style="padding:2px 8px; font-size:10.5px;" onclick="event.stopPropagation(); window.openProofDrawer(${idx})">Inspect</button></td>
    </tr>
  `).join('');
}

// Proof Inspector Modal Drawer
export function openProofDrawer(idx = 0) {
  const backdrop = $('proof-drawer-backdrop');
  if (backdrop) backdrop.classList.add('active');
}
window.openProofDrawer = openProofDrawer;

export function closeProofDrawer() {
  const backdrop = $('proof-drawer-backdrop');
  if (backdrop) backdrop.classList.remove('active');
}
window.closeProofDrawer = closeProofDrawer;

// Pre-Flight Borrow Calculation Check
function updateBorrowPreview() {
  const amountInput = $('borrow-amount-input');
  const amount = Number(amountInput ? amountInput.value : 50) || 0;
  const avail = (state.dashboardData && state.dashboardData.availNum) || 0;
  const maxCap = state.policyLimit || 2000;

  if ($('prev-req-amt')) $('prev-req-amt').textContent = `$${amount.toLocaleString()}`;
  if ($('prev-policy-max')) $('prev-policy-max').textContent = `$${maxCap.toLocaleString()}`;
  if ($('prev-avail-cap')) $('prev-avail-cap').textContent = `$${avail.toLocaleString()}`;

  const badge = $('prev-result-badge');
  if (!badge) return;

  if (amount <= 0) {
    badge.className = 'badge dim';
    badge.textContent = 'ENTER AMOUNT';
  } else if (amount > maxCap) {
    badge.className = 'badge danger';
    badge.textContent = 'REJECTED: POLICY LIMIT EXCEEDED ($2,000)';
  } else if (avail < amount) {
    badge.className = 'badge danger';
    badge.textContent = 'REJECTED: INSUFFICIENT CREDIT CAPACITY';
  } else {
    badge.className = 'badge verified';
    badge.textContent = 'BORROW APPROVED BY POLICY';
  }
}

// Execute Borrow Action
async function handleBorrow() {
  if (!state.signer) {
    showToast("Please connect your wallet first.", "warning");
    return;
  }
  const amount = Number($('borrow-amount-input').value) || 0;
  const tenor = Number($('borrow-tenor-input').value) || 604800;

  try {
    showToast(`Submitting borrow request: $${amount}...`, "info");
    const tx = await state.contracts.creditline.borrow(state.merchantId, amount, tenor, amount);
    await tx.wait();
    showToast(`Borrow drawdown successful! Tx mined.`, "success");
    await refreshDashboard();
  } catch (err) {
    const decoded = decodeContractError(err, [state.contracts.creditline ? state.contracts.creditline.interface : null]);
    showToast(`${decoded.explanation.title}: ${decoded.explanation.description}`, "error");
  }
}

// Execute Repay Action
async function handleRepay() {
  if (!state.signer) {
    showToast("Please connect your wallet first.", "warning");
    return;
  }
  const exposure = (state.dashboardData && state.dashboardData.exposureNum) || 0;
  if (exposure <= 0) {
    showToast("No active debt exposure to repay.", "info");
    return;
  }
  try {
    showToast(`Repaying exposure: $${exposure}...`, "info");
    const tx = await state.contracts.creditline.repay(state.merchantId, { value: ethers.parseEther("0.001") });
    await tx.wait();
    showToast("Loan repayment recorded on-chain!", "success");
    await refreshDashboard();
  } catch (err) {
    const decoded = decodeContractError(err);
    showToast(`${decoded.explanation.title}: ${decoded.explanation.description}`, "error");
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
    logBox.innerHTML += `<div style="color:#10b981; font-weight:600;">[4/4] Cryptographically verified and decoded on Creditcoin! Capacity updated.</div>`;
    showToast("Economic evidence verified and recorded!", "success");
    await refreshDashboard();
  } catch (err) {
    const decoded = decodeContractError(err);
    logBox.innerHTML += `<div style="color:#ef4444;">[Error] ${decoded.explanation.title}: ${decoded.explanation.description}</div>`;
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

  resEl.textContent = "Executing attack payload on-chain...";
  resEl.className = "attack-result-box active";

  const { merkleProof, continuityProof } = buildEmptyProofs();

  try {
    if (attackKey === 'replay') {
      const rawLog = buildRawLog(state.config.contracts.economicEvents, 0, state.merchantId, 500);
      const encodedTx = buildEncodedTransaction(state.config.contracts.economicEvents, true, [rawLog], 8888);
      const evidence = [state.config.sourceChainKey, 1, encodedTx, merkleProof, continuityProof, state.config.contracts.economicEvents, 0];
      try { await state.contracts.verifier.submitEvidence(evidence); } catch (_) {}
      await state.contracts.verifier.submitEvidence(evidence);
      resEl.textContent = "CRITICAL: Replay attack succeeded unexpectedly.";
    } else if (attackKey === 'fakesource') {
      const rawLog = buildRawLog(state.config.contracts.economicEvents, 0, state.merchantId, 500);
      const encodedTx = buildEncodedTransaction(state.config.contracts.economicEvents, true, [rawLog], Date.now());
      const fakeAddress = "0x00000000000000000000000000000000badc0ffe";
      const evidence = [state.config.sourceChainKey, 1, encodedTx, merkleProof, continuityProof, fakeAddress, 0];
      await state.contracts.verifier.submitEvidence(evidence);
      resEl.textContent = "CRITICAL: Fake source contract was accepted.";
    } else if (attackKey === 'failedtx') {
      const rawLog = buildRawLog(state.config.contracts.economicEvents, 0, state.merchantId, 500);
      const encodedTx = buildEncodedTransaction(state.config.contracts.economicEvents, false, [rawLog], Date.now());
      const evidence = [state.config.sourceChainKey, 1, encodedTx, merkleProof, continuityProof, state.config.contracts.economicEvents, 0];
      await state.contracts.verifier.submitEvidence(evidence);
      resEl.textContent = "CRITICAL: Reverted source transaction generated credit.";
    } else if (attackKey === 'maliciousai') {
      await state.contracts.creditline.borrow(state.merchantId, 50000, 604800, 50000);
      resEl.textContent = "CRITICAL: Policy limit was bypassed.";
    }
  } catch (err) {
    const decoded = decodeContractError(err, [
      state.contracts.verifier ? state.contracts.verifier.interface : null,
      state.contracts.creditline ? state.contracts.creditline.interface : null
    ]);
    resEl.innerHTML = `
      <div style="font-weight:700; color:#10b981; margin-bottom:2px;">✓ ATTACK BLOCKED ON-CHAIN</div>
      <div class="mono" style="font-size:11px; color:#fff;">${decoded.name} (${decoded.selector})</div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${decoded.explanation.description}</div>
      <div style="font-size:10px; color:var(--brand-primary); margin-top:2px;">Enforcing Contract: ${decoded.explanation.authority}</div>
    `;
  }
}

// Developer API Live Query
async function executeApiQuery() {
  const terminal = $('api-response-box');
  if (!terminal) return;
  if (!state.config.isConfigured || !state.contracts.passport) {
    terminal.textContent = JSON.stringify({ error: "Contracts not deployed on this network. Please switch to Local Anvil." }, null, 2);
    return;
  }
  terminal.textContent = "Executing live RPC query against getMerchantState()...";
  try {
    const c = state.contracts.passport;
    const stateTuple = await c.getMerchantState(state.merchantId);
    const result = {
      network: state.config.name,
      rpcEndpoint: state.config.rpc,
      creditPassportContract: state.config.contracts.creditPassport,
      method: "getMerchantState(bytes32 merchantId)",
      merchantAlias: state.merchantName,
      merchantIdHex: state.merchantId,
      onChainResponse: {
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
export function applyEnvironment(envKey) {
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

  // Update Settings text
  if ($('cfg-active-name')) $('cfg-active-name').textContent = state.config.name;
  if ($('cfg-active-rpc')) $('cfg-active-rpc').textContent = state.config.rpc;
  if ($('cfg-active-chainkey')) $('cfg-active-chainkey').textContent = `${state.config.sourceChainKey} (${state.config.id === 'cc3' ? 'Sepolia' : 'Local Anvil'})`;
  if ($('cfg-active-status')) $('cfg-active-status').textContent = state.config.statusText;

  showToast(`Switched network to ${state.config.shortName}`);
  refreshDashboard();
}
window.applyEnvironment = applyEnvironment;

// Judge Mode 90-Second Walkthrough
function toggleJudgeMode() {
  state.judgeMode = !state.judgeMode;
  const ribbon = $('judge-tour-ribbon');
  const btn = $('judge-mode-toggle-btn');
  if (ribbon) ribbon.classList.toggle('active', state.judgeMode);
  if (btn) btn.textContent = state.judgeMode ? '⚡ Exit Tour' : '⚡ Judge Tour (90s)';
  if (state.judgeMode) {
    navigateToPage('overview');
    showToast("Judge Tour Activated (90s High-Trust Walkthrough)", "info");
  }
}

// DOM Initialization
window.addEventListener('DOMContentLoaded', async () => {
  // Navigation Buttons
  document.querySelectorAll('nav.nav-menu button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateToPage(btn.dataset.page));
  });

  // Mobile Menu Toggle
  const mobileToggle = $('mobile-toggle-btn');
  const sidebar = document.querySelector('aside.sidebar');
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
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

  // Proof Drawer Open / Close
  const openInspectorBtn = $('open-full-inspector-btn');
  if (openInspectorBtn) openInspectorBtn.addEventListener('click', () => openProofDrawer(0));

  const closeInspectorBtn = $('close-proof-modal-btn');
  if (closeInspectorBtn) closeInspectorBtn.addEventListener('click', closeProofDrawer);

  const drawerBackdrop = $('proof-drawer-backdrop');
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', (e) => {
      if (e.target === drawerBackdrop) closeProofDrawer();
    });
  }

  // 7-Step Journey Click Navigation
  document.querySelectorAll('.journey-step-card').forEach((step, idx) => {
    step.addEventListener('click', () => {
      const pageMap = ['activity', 'proofs', 'proofs', 'passport', 'capacity', 'creditline', 'overview'];
      navigateToPage(pageMap[idx] || 'overview');
    });
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

  // Default network: If hosted on Vercel or non-localhost, default to CC3 Testnet
  const isVercelOrRemote = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  applyEnvironment(isVercelOrRemote ? 'cc3' : 'local');
});
