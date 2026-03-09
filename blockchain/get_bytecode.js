const fs = require('fs');
const path = require('path');
const jsonPath = path.join(__dirname, 'out', 'AgentRegistry.sol', 'AgentRegistry.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
console.log(data.deployedBytecode.object);
