# 🛡️ StealthBond LATAM
### Institutional RWA Tokenization & Private Secondary Market
**Built with Chainlink ACE, CRE & Keystone**

StealthBond LATAM is an institutional-grade platform for tokenizing Real World Assets (RWA), specializing in Latin American corporate debt (Bonds). The project utilizes the **Chainlink Runtime Environment (CRE)** and **Confidential Compute (TEE)** to bridge private financial data with public blockchain liquidity while maintaining strict regulatory compliance and investor privacy.

---

## 🚀 Key Features

- **Stage 1 (Identity):** Privacy-preserving onboarding using **Chainlink ACE**. Identities are verified off-chain via SENIAT/GLEIF in a TEE and anchored as CCIDs.
- **Stage 2 (Issuance):** Compliant bond tokenization using **ERC-3643**. Automated collateral verification via CRE and multichain minting via **CCIP**.
- **Stage 3 (Monitor):** Real-time Proof of Reserve (PoR) with an autonomous **AI Circuit Breaker** powered by Gemini AI.
- **Stage 4 (Market):** Fully private secondary market. Bids are processed in a TEE, and settlement is executed via cryptographically signed withdrawal tickets.
- **Stage 5 (Compliance):** Multichain AML enforcement. Automated screening against OFAC and fraud databases with instant cross-chain freezing.
- **Stage 6 (Reports):** Generative regulatory reports. **Gemini AI** synthesizes audit data into natural language reports encrypted for SUNAVAL.

---

## 🛠️ Repository Structure

```text
/
├── frontend/             # Vanilla JS + CSS Frontend (SVR & Keystone Integrated)
├── core-engine/         # Node.js backend (TEE Orchestrator & API)
├── cre-project/         # Chainlink Runtime Environment (CRE) Workflows
│   └── workflows/       # Stage 1-6 TypeScript logic for TEE Enclaves
├── blockchain/          # Foundry Smart Contract Suite
│   ├── src/             # ERC-3643 compliant RWA & ACE Identity Registry
│   └── script/          # Deployment & Seeding Scripts
├── TECHNICAL_SPEC.md    # Deep technical dive & architecture diagrams
└── start.bat            # Local dev stack runner (Anvil + Backend + Frontend)
```

## ⚙️ Quick Start (Local Demo)

1. **Prerequisites:**
   - [Foundry](https://getfoundry.sh/)
   - [Node.js](https://nodejs.org/)
   - [Chainlink CRE CLI](https://docs.chain.link/cre)

2. **Installation:**
   ```bash
   npm install
   cd core-engine && npm install
   cd ../cre-project && npm install
   ```

3. **Running the Stack:**
   - Copy `.env.example` to `.env` and configure your keys.
   - Run the automated launcher:
     ```bash
     .\start.bat
     ```

4. **Accessing the UI:**
   - Open browser at `http://localhost:3000`
   - Connect MetaMask to local Anvil (`http://localhost:8545`, Chain ID `31337`).

---

## 🛡️ Security & Privacy

StealthBond LATAM utilizes the **ACE Secure Envelope** architecture. Sensitive data such as Tax IDs (RIF) and bank reserve API keys are only decrypted inside the **TEE (Confidential Compute)** and are never exposed to the public internet or stored in plaintext.

---
*Created for the 2026 Chainlink Hackathon.*
