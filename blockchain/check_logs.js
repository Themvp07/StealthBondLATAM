const { execSync } = require('child_process');

async function checkLatestLogs() {
    const registryAddr = '0x15fC6ae953E024d975e77382eEeC56A9101f9F88';
    const rpcUrl = 'http://127.0.0.1:8545';

    console.log(`Analyzing latest transactions to ${registryAddr}...`);

    // Get latest block
    const blockNum = parseInt(execSync(`cast block-number --rpc-url ${rpcUrl}`).toString().trim());

    // Scan last 5 blocks
    for (let b = blockNum; b > blockNum - 5; b--) {
        if (b < 0) break;
        const block = JSON.parse(execSync(`cast block ${b} --full --json --rpc-url ${rpcUrl}`).toString());

        for (const tx of block.transactions) {
            if (tx.to && tx.to.toLowerCase() === registryAddr.toLowerCase()) {
                console.log(`\n[BLOCK ${b}] TX: ${tx.hash}`);
                const receipt = JSON.parse(execSync(`cast receipt ${tx.hash} --json --rpc-url ${rpcUrl}`).toString());

                if (receipt.logs) {
                    for (const log of receipt.logs) {
                        // Decode DebugAddress (topic: DebugAddress(string,address))
                        // keccak256("DebugAddress(string,address)") = 0xb3f7d6c63a62ab0e6ae5263ef1deb9c5a64f4689288c380db949c116314a5540
                        if (log.topics[0] === '0xb3f7d6c63a62ab0e6ae5263ef1deb9c5a64f4689288c380db949c116314a5540') {
                            const data = log.data;
                            // DebugAddress(string,address)
                            // The address is in the last 32-byte slot of the data
                            const addr = '0x' + data.substring(data.length - 40);
                            console.log('EVENT: DebugAddress - Wallet:', addr);
                        }
                        // DebugLog(string,address)
                        // keccak256("DebugLog(string,address)") = 0xd54ba61ed4070561dcc6d272cdd44f051344b2c11b31180228f79dcb0003cf83
                        if (log.topics[0] === '0xd54ba61ed4070561dcc6d272cdd44f051344b2c11b31180228f79dcb0003cf83') {
                            const data = log.data;
                            const addr = '0x' + data.substring(data.length - 40);
                            console.log('EVENT: DebugLog - Found/Registered Wallet:', addr);
                        }
                        // IdentityRegistered(address,uint8,bytes32) -> topic[0]: 0xe9408329...
                        if (log.topics[0].startsWith('0xe9408329')) {
                            const wallet = '0x' + log.topics[1].substring(26);
                            console.log('✅ CONFIRMED ON-CHAIN: IdentityRegistered for:', wallet);
                        }
                    }
                }
            }
        }
    }
}

checkLatestLogs();
