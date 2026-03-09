// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockStablecoin is ERC20, Ownable {
    uint8 private immutable _customDecimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) Ownable(msg.sender) {
        _customDecimals = decimals_;
        // Mint 1 billion tokens to deployer
        _mint(msg.sender, 1000000000 * 10**decimals_);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }
}
