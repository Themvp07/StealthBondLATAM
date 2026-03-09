// Mock SENIAT: National Integrated Customs and Tax Administration Service (Venezuela)
// This service simulates the official verification of tax identification (RIF).

const log = require('../utils/logger').log;

/**
 * Privacy Standard Implementation:
 * In a real scenario, the government doesn't just return data;
 * it verifies if the hash of the document provided by the user matches
 * the hash of the official document in their records.
 */
const GOVERNMENT_DB = {
  // Companies
  'J-123456789': {
    name: 'Space4Build C.A.',
    status: 'ACTIVE',
    type: 'company',
    officialDocHash: 'ANY' // Special value to skip validation in demo
  },
  'J-987654321': {
    name: 'CryptoVzla S.A.',
    status: 'ACTIVE',
    type: 'company',
    officialDocHash: 'ANY'
  },
  'J-00002967-9': {
    name: 'BANCO PROVINCIAL S.A.',
    status: 'ACTIVE',
    type: 'company',
    officialDocHash: 'ANY'
  },
  'J-000029504': {
    name: 'BANCO EXTERIOR C.A.',
    status: 'ACTIVE',
    type: 'company',
    officialDocHash: 'ANY'
  },
  // Persons
  'V-12345678': {
    name: 'Juan Pérez',
    status: 'ACTIVE',
    type: 'person',
    officialDocHash: 'ANY'
  },
  'V-30123456': {
    name: 'María Alejandra Gómez',
    status: 'ACTIVE',
    type: 'person',
    officialDocHash: 'ANY'
  },
  'V-25987654': {
    name: 'Carlos Mendoza',
    status: 'ACTIVE',
    type: 'person',
    officialDocHash: 'ANY'
  },
  'V-18765432': {
    name: 'Ana Sofía Rojas',
    status: 'ACTIVE',
    type: 'person',
    officialDocHash: 'ANY'
  }
};

// Simulated latency
const simulateDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Core logic for internal use (e.g., from kyc.js)
async function verify(rif, docHash, type) {
  await simulateDelay(1500);

  let entry = GOVERNMENT_DB[rif];

  // Make the mock more compassionate for testing purposes
  if (!entry) {
    if (rif.startsWith('V-') || rif.startsWith('J-') || rif.startsWith('E-') || rif.startsWith('G-')) {
      entry = {
        name: rif.startsWith('J-') ? 'Demo Company C.A.' : 'Demo User',
        status: 'ACTIVE',
        type: rif.startsWith('J-') ? 'company' : 'person',
        officialDocHash: 'ANY'
      };
    } else {
      return {
        valid: false,
        message: `Invalid RIF [${rif}]. Must start with V-, J-, E-, or G-.`
      };
    }
  }

  if (entry.officialDocHash !== 'ANY' && docHash !== entry.officialDocHash) {
    return {
      valid: false,
      message: 'Integrity Failed: The provided PDF document does not match the official SENIAT record.'
    };
  }

  if (entry.type !== type) {
    return {
      valid: false,
      message: 'Mismatch: The entity type (Physical/Corporate) is incorrect.'
    };
  }

  return {
    valid: true,
    name: entry.name,
    status: entry.status,
    verificationId: `CERT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
  };
}

// Express route handler
async function verifyHandler(req, res) {
  const { docHash, type, rif } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== (process.env.SENIAT_API_KEY || 'SB-GOV-SECRET-2026')) {
    return res.status(401).json({ valid: false, message: 'Unauthorized: Invalid Government API Key' });
  }

  const result = await verify(rif, docHash, type);
  if (result.valid) {
    log('SENIAT', `✅ Identity verified with total integrity for: ${result.name}`);
  } else {
    log('SENIAT', `❌ Validation failed: ${result.message}`);
  }
  res.json(result);
}

module.exports = {
  verify,
  verifyHandler
};
