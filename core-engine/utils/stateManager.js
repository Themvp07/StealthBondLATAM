const { readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'state.json');

function loadState() {
  const defaults = {
    bonds: {},
    auctions: [],
    reports: [],
    kyc: {},
    agents: {}
  };
  if (existsSync(STATE_FILE)) {
    try {
      const loaded = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      // Merge: ensures all default properties exist
      return { ...defaults, ...loaded };
    } catch (e) {
      console.error('Error reading state.json, creating new state');
    }
  }
  return defaults;
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

module.exports = { loadState, saveState };
