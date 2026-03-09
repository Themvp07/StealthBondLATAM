const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const bytecode = fs.readFileSync('bytecode.txt', 'utf8').trim();
const targetAddr = '0x15fC6ae953E024d975e77382eEeC56A9101f9F88';

console.log(`Setting code for ${targetAddr}...`);
try {
    const cmd = `cast rpc anvil_setCode ${targetAddr} 0x${bytecode} --rpc-url http://127.0.0.1:8545`;
    execSync(cmd);
    console.log('✅ Success!');
} catch (e) {
    console.error('❌ Failed:', e.message);
}
