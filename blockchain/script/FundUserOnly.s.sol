// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

contract FundUserOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // We use parseAddress to avoid compiler (Solc) checksum validation
        address usdc = vm.parseAddress(
            "0x68b1d87f95878fe05b998f19b66f4baba5de1aed"
        );
        address ves = vm.parseAddress(
            "0x3aa5ebb10dc797cac828524e59a333d0a371443c"
        );
        address eurc = vm.parseAddress(
            "0xc6e7df5e7b4f2a278906862b61205850344d4e7d"
        );

        address[] memory targets = new address[](5);
        targets[0] = vm.parseAddress(
            "0xEdEc8527Bf0A56da24A2070402C824f761CD34a7"
        );
        targets[1] = vm.parseAddress(
            "0xA66854B2Df0dd19b96af382336721b61F222DDFf"
        );
        targets[2] = vm.parseAddress(
            "0x0319c4140fcF7ce77306D68F652F135c063e463d"
        );
        targets[3] = vm.parseAddress(
            "0x335484D0F28E232AFe5892AA621FA0AaC5460c08"
        );
        targets[4] = vm.parseAddress(
            "0x2F214de1ad31E4934999224784880726F994089f"
        );

        uint256 amount = 1000000 * 10 ** 6;

        for (uint i = 0; i < targets.length; i++) {
            IMintable(usdc).mint(targets[i], amount);
            IMintable(ves).mint(targets[i], amount * 42);
            IMintable(eurc).mint(targets[i], amount);
            payable(targets[i]).transfer(5 ether);
            console.log("Funded successfully:", targets[i]);
        }

        vm.stopBroadcast();
    }
}
