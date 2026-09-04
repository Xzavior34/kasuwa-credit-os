# Kasuwa Credit OS — Institutional Web Frontend

**"Verified economic activity. Programmable credit."**

An institutional-grade, zero-build Web3 fintech dashboard that transforms independently verified economic activity into persistent, programmable credit capacity.

---

## Architecture & Design Principles

- **Zero-Build, Pure Web Standards**: Pure ES6 modules, clean CSS3 design system, and Ethers.js v6. No complex bundlers, no broken dependencies, instant hot-serve anywhere.
- **Zero Fabricated Data**: Every figure, metric, and event trace is a live on-chain read from `CreditPassport.sol`, `PolicyEngine.sol`, and `AttestcoinVerifier.sol`.
- **Institutional Dark Aesthetic**: Deep obsidian surfaces (`#050811`), restrained slate borders (`#162238`), tabular figures, electric blue accents, and purposeful semantic indicators.
- **Deterministic Policy Hierarchy**: Visualizes the core security invariant — `AI = Advisor (Advisory Only)`, `Smart Contracts = Authority (Deterministic Policy)`.

---

## Structure

```
frontend/
├── index.html                 # Institutional UI application shell
├── css/
│   └── styles.css             # Institutional Fintech Design System
├── js/
│   ├── config.js              # Network presets (Anvil / CC3), ABIs, event signatures
│   ├── decoder.js             # Centralized custom error decoding & human explanations
│   ├── evidence.js            # Browser-side USC v0.18.0 chunk encoder & packaging
│   ├── wallet.js              # State machine for MetaMask / Browser wallets
│   └── app.js                 # UI coordinator, live SVG gauge, 7-step pipeline, pages
├── deployment.local.json      # Local Anvil deployment configuration
└── deployment.cc3-testnet.json # Creditcoin CC3 Testnet preset configuration
```

---

## 8 Platform Pages

1. **Overview**: Real-time capacity utilization circular gauge, deterministic Credit Health Scorecard, KPI stat tiles, and interactive 7-step credit lifecycle journey.
2. **Credit Passport**: Persistent on-chain economic identity with complete verified event ledger and trace inspector.
3. **Capacity Engine**: Deterministic mathematical formula display (`CreditEngine.sol`) and live merchant evaluation breakdown.
4. **Credit Line**: Programmatic credit facility with real-time pre-flight eligibility checks, draw transactions, and Risk Advisor (`ADVISORY ONLY`) guardrails.
5. **Proof Explorer**: 5-stage cryptographic trace pipeline from source transaction to on-chain state with deep technical inspector and byte-level breakdown.
6. **Economic Activity**: Source-chain economic event emitter with single-click "Emit & Prove to Kasuwa".
7. **Security Lab**: 4 live attack consoles demonstrating deterministic custom error reverts on-chain.
8. **Developer API**: Live Solidity interfaces (`ICreditPassport.sol`) and interactive RPC query terminal.
9. **Settings**: Instant one-click switching between Local Anvil (`31337`) and Creditcoin CC3 Testnet (`102031`).

---

## Running Locally

```bash
# Launch Anvil, deploy contracts, seed merchant data, and start web server
powershell -ExecutionPolicy Bypass -File demo/start_local_environment.ps1
```

Open `http://localhost:3000` in your browser.

