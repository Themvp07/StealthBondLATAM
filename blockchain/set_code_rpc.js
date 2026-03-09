const fs = require('fs');

async function setCode() {
    // Read and clean the bytecode
    let bytecode = fs.readFileSync('bytecode.txt', 'utf8').trim();
    // Remove any accidental whitespace or newlines inside the string
    bytecode = bytecode.replace(/\s+/g, '');

    // Ensure it starts with 0x exactly once
    if (bytecode.startsWith('0x')) bytecode = bytecode.substring(2);
    const fullBytecode = '0x' + bytecode;

    const targetAddr = '0x15fC6ae953E024d975e77382eEeC56A9101f9F88';

    console.log(`Setting code at ${targetAddr}... Length: ${fullBytecode.length}`);

    const payload = {
        jsonrpc: "2.0",
        method: "anvil_setCode",
        params: [targetAddr, fullBytecode],
        id: 1
    };

    try {
        const response = await fetch('http://127.0.0.1:8545', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        console.log('Result:', result);
        if (result.error) {
            console.error('❌ RPC Error:', result.error);
        } else {
            console.log('✅ Success!');
        }
    } catch (e) {
        console.error('❌ Fetch Error:', e.message);
    }
}

setCode();
