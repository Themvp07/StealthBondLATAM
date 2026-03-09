// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockStablecoin} from "../src/common/MockStablecoin.sol";

contract SeedWallets is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Stablecoins
        MockStablecoin usdc = new MockStablecoin("Stealth USDC", "USDC", 6);
        MockStablecoin ves = new MockStablecoin("Stealth VES", "VES", 6);
        MockStablecoin eurc = new MockStablecoin("Stealth EURC", "EURC", 6);

        console.log("Stealth USDC deployed at:", address(usdc));
        console.log("Stealth VES  deployed at:", address(ves));
        console.log("Stealth EURC deployed at:", address(eurc));

        address[] memory wallets = new address[](11);
        wallets[0] = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Main Anvil
        wallets[1] = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // Emisor Legacy
        wallets[2] = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // Inver 1
        wallets[3] = 0x90F79bf6EB2c4f870365E785982E1f101E93b906; // Inver 2
        wallets[4] = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65; // SUNAVAL
        wallets[5] = 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f; // Agent AIA 1

        // User's Real Wallets (MetaMask)
        wallets[6] = 0xEdEc8527Bf0A56da24A2070402C824f761CD34a7;
        wallets[7] = 0xA66854B2Df0dd19b96af382336721b61F222DDFf;
        wallets[8] = 0x0319c4140fcF7ce77306D68F652F135c063e463d;
        wallets[9] = 0x335484D0F28E232AFe5892AA621FA0AaC5460c08;
        wallets[10] = 0x2F214de1ad31E4934999224784880726F994089f;

        uint256 amount = 100000 * 10 ** 6; // 100k each

        for (uint i = 0; i < wallets.length; i++) {
            usdc.mint(wallets[i], amount);
            ves.mint(wallets[i], amount * 42); // A bit more VES for parity decimals (e.g. rate 42)
            eurc.mint(wallets[i], amount);

            payable(wallets[i]).transfer(1 ether);
            console.log("Wallet funded with RWA Liquidity:", wallets[i]);
        }

        vm.stopBroadcast();
    }
}
