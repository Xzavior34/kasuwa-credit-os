// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";
import {CreditPassport} from "../src/CreditPassport.sol";
import {CreditEngine} from "../src/CreditEngine.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {EconomicEvents} from "../src/EconomicEvents.sol";
import {BLOCK_PROVER_PRECOMPILE_ADDRESS} from "../src/interfaces/INativeQueryVerifier.sol";

/// @title Deploy
/// @notice Deploys the full Kasuwa contract stack to whatever RPC `--rpc-url` points at, wires
/// the required cross-contract permissions, and persists the result to
/// `deployments/<chainid>.json`. Unmodified, this script works against a local Anvil chain, a
/// real Creditcoin CC3 testnet RPC, or any other EVM-compatible target — see docs/DEPLOYMENT.md.
///
/// This script has been run and verified ONLY against a local Anvil chain in this build
/// environment (no network route to any live testnet exists here — see
/// docs/IMPLEMENTATION_AUDIT.md). It has not been run against Creditcoin CC3 testnet or any
/// public Sepolia deployment. Do not read a deployments/<chainid>.json produced by this script
/// as evidence of a live deployment unless the chainId in that file matches a real public
/// network's chain ID and you can independently confirm it via that network's explorer.
///
/// Env vars:
///   PRIVATE_KEY            - deployer key (required). Use a DEDICATED TESTNET WALLET for any
///                            real network — never a mainnet key.
///   BLOCK_PROVER_ADDRESS   - optional override; defaults to the REAL verified Creditcoin
///                            BlockProver precompile address (0x...0FD2, see docs/NETWORKS.md).
///                            Override this ONLY when deploying to a chain that does not have
///                            that real precompile (e.g. local Anvil, which cannot execute
///                            Creditcoin-specific precompiled contracts) — point it at a
///                            deployed MockBlockProver instead; the deployment log/JSON records
///                            that override so it's never mistaken for the real one.
///   DEPLOY_ECONOMIC_EVENTS - "true"/"false" (default true) - whether to also deploy the demo
///                            source-chain contract against this same RPC target. On a real
///                            two-chain deployment you'd normally run this script twice: once
///                            against the source chain's RPC with DEPLOY_ECONOMIC_EVENTS=true
///                            and the rest skipped, and once against Creditcoin's RPC with the
///                            Kasuwa contracts and DEPLOY_ECONOMIC_EVENTS=false.
contract Deploy is Script {
    // Deployed addresses are held in storage (not passed around as locals) specifically to
    // avoid "stack too deep" — this script deploys six+ contracts in one run.
    CreditEngine public engine;
    AttestcoinVerifier public verifier;
    CreditPassport public passport;
    PolicyEngine public policy;
    LiquidityPool public pool;
    CreditLine public creditLine;
    address public economicEvents;
    address public blockProver;
    bool public usingRealPrecompile;
    address public deployer;
    uint64 public sourceChainKey;

    function run() external {
        vm.prevrandao(bytes32(uint256(1)));
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(deployerKey);

        blockProver = vm.envOr("BLOCK_PROVER_ADDRESS", BLOCK_PROVER_PRECOMPILE_ADDRESS);
        bool deployEconomicEvents = vm.envOr("DEPLOY_ECONOMIC_EVENTS", true);
        usingRealPrecompile = blockProver == BLOCK_PROVER_PRECOMPILE_ADDRESS;
        sourceChainKey = uint64(vm.envOr("SOURCE_CHAIN_KEY", uint256(2)));

        vm.startBroadcast(deployerKey);
        _deployContracts();
        _wirePermissions();
        if (deployEconomicEvents) {
            economicEvents = address(new EconomicEvents());
            verifier.registerSourceContract(sourceChainKey, economicEvents);
        } else {
            // Two-chain deployment: EconomicEvents already deployed separately on the actual
            // source chain (this run only deploys the Creditcoin-side contracts). Register its
            // address here if provided.
            address externalEconomicEvents = vm.envOr("ECONOMIC_EVENTS_ADDRESS", address(0));
            if (externalEconomicEvents != address(0)) {
                verifier.registerSourceContract(sourceChainKey, externalEconomicEvents);
                economicEvents = externalEconomicEvents;
            }
        }
        vm.stopBroadcast();

        _logDeployment(deployEconomicEvents);
        _writeDeploymentJson();
    }

    function _deployContracts() internal {
        engine = new CreditEngine();
        verifier = new AttestcoinVerifier(blockProver, deployer);
        passport = new CreditPassport(deployer, engine);
        policy = new PolicyEngine(deployer);
        pool = new LiquidityPool(deployer);
        creditLine = new CreditLine(deployer, passport, policy, pool, engine);
    }

    function _wirePermissions() internal {
        passport.setAttestcoinVerifier(address(verifier));
        passport.setCreditLine(address(creditLine));
        pool.setCreditLine(address(creditLine));
        verifier.setCreditPassport(address(passport));
    }

    function _logDeployment(bool deployEconomicEvents) internal view {
        console2.log("chainId:              ", block.chainid);
        console2.log("deployer:             ", deployer);
        console2.log("CreditEngine:         ", address(engine));
        console2.log("AttestcoinVerifier:   ", address(verifier));
        console2.log("CreditPassport:       ", address(passport));
        console2.log("PolicyEngine:         ", address(policy));
        console2.log("LiquidityPool:        ", address(pool));
        console2.log("CreditLine:           ", address(creditLine));
        console2.log("BlockProver used:     ", blockProver);
        console2.log("  -> is real Creditcoin precompile:", usingRealPrecompile);
        console2.log("sourceChainKey:       ", sourceChainKey);
        if (deployEconomicEvents) {
            console2.log("EconomicEvents:       ", economicEvents);
        }
    }

    function _writeDeploymentJson() internal {
        string memory root = "deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "creditEngine", address(engine));
        vm.serializeAddress(root, "attestcoinVerifier", address(verifier));
        vm.serializeAddress(root, "creditPassport", address(passport));
        vm.serializeAddress(root, "policyEngine", address(policy));
        vm.serializeAddress(root, "liquidityPool", address(pool));
        vm.serializeAddress(root, "creditLine", address(creditLine));
        vm.serializeAddress(root, "blockProverUsed", blockProver);
        vm.serializeAddress(root, "economicEvents", economicEvents);
        vm.serializeUint(root, "sourceChainKey", sourceChainKey);
        string memory json = vm.serializeUint(root, "usingRealCreditcoinPrecompile", usingRealPrecompile ? 1 : 0);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Deployment record written to", path);
    }
}
