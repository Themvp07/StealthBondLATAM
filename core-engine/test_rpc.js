const { ethers } = require('ethers');

const RPC = "https://ethereum-rpc.publicnode.com";
const ADDRESS = "0x37be050e75C7F0a80F0E8abBFC2c4Ff826728cAa".toLowerCase();
const ABI = ["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"];

async function test() {
    const provider = new ethers.JsonRpcProvider(RPC);
    try {
        const block = await provider.getBlockNumber();
        console.log("Current block:", block);

        const code = await provider.getCode(ADDRESS);
        console.log("Code at address (length):", code.length);

        const contract = new ethers.Contract(ADDRESS, ABI, provider);
        const data = await contract.latestRoundData();
        console.log("Data:", data);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();
