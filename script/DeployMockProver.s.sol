// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockBlockProver} from "../test/mocks/MockBlockProver.sol";

contract DeployMockProver is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(key);
        MockBlockProver m = new MockBlockProver();
        vm.stopBroadcast();
        console2.log("MockBlockProver:", address(m));
    }
}
