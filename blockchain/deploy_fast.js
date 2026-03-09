const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function deploy() {
    console.log('--- Step 1: Compiling contract ---');
    execSync('forge build src/stage1-identity/AgentRegistry.sol --force', { stdio: 'inherit' });

    console.log('--- Step 2: Extracting bytecode ---');
    const jsonPath = path.join('out', 'AgentRegistry.sol', 'AgentRegistry.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const bytecode = data.deployedBytecode.object;

    if (!bytecode || bytecode === '0x') {
        throw new Error('Bytecode extraction failed!');
    }
    console.log(`Bytecode extracted (Length: ${bytecode.length})`);

    console.log('--- Step 3: Injecting bytecode to 0x15fC... ---');
    const targetAddr = '0x15fC6ae953E024d975e77382eEeC56A9101f9F88';

    // Ensure 0x prefix
    const fullBytecode = bytecode.startsWith('0x') ? bytecode : '0x' + bytecode;

    const payload = {
        jsonrpc: "2.0",
        method: "anvil_setCode",
        params: [targetAddr, fullBytecode],
        id: 1
    };

    const response = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (result.error) {
        console.error('❌ RPC Error:', result.error);
    } else {
        console.log('✅ Success! Contract injected at', targetAddr);

        // Final check
        const check = execSync(`cast code ${targetAddr} --rpc-url http://127.0.0.1:8545`).toString().trim();
        console.log(`Verification: On-chain code length is ${check.length}`);
    }
}

deploy().catch(console.error);
