// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {EconomicEvents} from "../src/EconomicEvents.sol";

/// @title DeploySourceOnly
/// @notice Deploys ONLY `EconomicEvents.sol` against a source chain (e.g. Ethereum Sepolia).
/// `script/Deploy.s.sol` always deploys the full Kasuwa/Creditcoin-side stack regardless of
/// `DEPLOY_ECONOMIC_EVENTS` (that flag only controls whether EconomicEvents is *additionally*
/// deployed alongside it) — fine for a single-chain local demo, but wasteful and confusing on a
/// real two-chain deployment: it would leave CreditEngine/CreditPassport/PolicyEngine/
/// LiquidityPool/CreditLine/AttestcoinVerifier instances sitting unused on Sepolia, wired to a
/// BlockProver precompile address that doesn't exist there. `docs/DEPLOYMENT.md` and
/// `docs/ANTIGRAVITY_HANDOFF.md` both flagged this as the right thing to split out — this script
/// is that split. Use this for the source-chain half of a real deployment, and
/// `script/Deploy.s.sol` (with `DEPLOY_ECONOMIC_EVENTS=false`) for the Creditcoin-side half.
///
/// Env vars:
///   PRIVATE_KEY - deployer key (required). Use a DEDICATED TESTNET WALLET — never a mainnet key.
contract DeploySourceOnly is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        EconomicEvents economicEvents = new EconomicEvents();
        vm.stopBroadcast();

        console2.log("chainId:          ", block.chainid);
        console2.log("deployer:         ", deployer);
        console2.log("EconomicEvents:   ", address(economicEvents));

        string memory root = "sourceDeployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "deployer", deployer);
        string memory json = vm.serializeAddress(root, "economicEvents", address(economicEvents));

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Deployment record written to", path);
    }
}
