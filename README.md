# 🛡️ StealthBond LATAM
### The Private RWA Compliance & AI-Orchestration Engine

**StealthBond LATAM** is a pioneering Real-World Asset (RWA) tokenization ecosystem designed for the Latin American market. It resolves the fundamental tension between **Institutional Privacy and Regulatory Transparency** by leveraging **Chainlink Runtime Environment (CRE)** and **Confidential Compute (TEE)**.

From fractionalized commercial papers to AI-driven automated guardrails, StealthBond provides the infrastructure for a secure, compliant, and liquid on-chain debt market.

---

## 🏆 Hackathon Tracks & Impact

StealthBond LATAM is engineered to compete across four key hackathon tracks:

### 1. DeFi & Tokenization (Institutional RWA Ecosystem)
- **Extreme Interoperability & Participation**: StealthBond expands the traditional bond market participants to include **Humans, Verified Corporations, and Autonomous AI Agents**, all operating under the same institutional standards.
- **Stage 1: Multi-Entity Onboarding**: Derives **CCID (Cross-Chain Identity Digest)** for all participants, enabling a permissioned environment compatible with **ACE** and **ERC-3643** identity registries.
- **Stage 2: Primary RWA Issuance**: Enables the fractionalized issuance of commercial papers settled in **USDC**. Our architecture ensures that every on-chain bond is 1:1 backed by institutional-grade collateral.
- **Stage 3: Multi-Currency Health Monitoring (PoR)**: This stage expands the scope to monitor reserves across multiple liquidities, including **USDC, EURC**, and a specialized exercise for **Venezuelan Bolívares (VES)**, demonstrating global adaptability.
- **Stage 4: Private Secondary Market**: Features a high-security secondary market settled in **USDC** using **Private Institutional Auctions (Sealed-bid)**. Bidders participate in price discovery within the TEE, ensuring that volume data remains confidential.
- **Impact**: Solving the LATAM liquidity gap by enabling compliant, global access to fractionalized high-yield debt.

### 2. CRE & AI (Institutional Intelligent Orchestration)
- **Gemini AI as a Security Layer**: In StealthBond LATAM, **Gemini AI** serves as a vital security filter and validator within the CRE Enclave, performing high-stakes risk assessments for the institutional market.
- **Stage 1: Identity Integrity**: Gemini AI detects document manipulation, providing a critical security layer to ensure the correct and untampered issuance of digital identities.
- **Stage 2: Collateral Analysis**: The AI analyzes the relationship between real-world collateral and the tokens to be issued, performing foundational security checks before any asset is recorded on the ledger.
- **Stage 3: Autonomous Bond Monitoring**: Gemini AI continuously monitors bond health and reserve status. *Note: While in production this would be triggered by time-based or on-chain events, for this demonstration it is activated via a dashboard trigger.*
- **Stage 4: Economic Investment Consultant**: Acting as a sophisticated economic analyst, the AI provides deep market strategy reports for auctions upon request. This service is monetized via **x402 micro-payments**, delivering expert insight without ever compromising the privacy of the underlying data.
- **Unwavering Privacy**: By executing all AI-driven validations within the TEE, StealthBond ensures that sensitive institutional data is never exposed while maintaining absolute transparency in the resulting on-chain actions.

### 3. Privacy (Confidential Compute & Secure Institutional Workflows)
StealthBond LATAM is a **"Privacy-First"** architecture where every stage is shielded by **Chainlink Confidential Compute (TEE)** and **Confidential HTTP**. We ensure that institutional secrets, PII, and sensitive market data never leak to the public mempool or the ledger.

- **Stage 1: PII Protection & Institutional KYB (CCID + GLEIF)**: 
    - **CCID Generation**: We normalize sensitive identity data (Names, Tax IDs) inside the TEE to derive a deterministic, non-reversible **Cross-Chain Identity Digest (CCID)**. This allows on-chain compliance without exposing Personally Identifiable Information (PII).
    - **Official Ingestions**: Sensitive KYB/KYC checks are performed via **Confidential HTTP** calls to **GLEIF** (official Chainlink partner) and **SENIAT** (Tax Authority). Credentials and request parameters are injected directly from the **Vault DON**, remaining invisible to the outside world.
- **Stage 2: Private Issuance & AI Structurer**: 
    - **Secure Collateral Validation**: Connection to banking APIs occurs strictly within the Enclave via Confidential HTTP to verify real-world assets without exposing balance sheets.
    - **AI Risk Modeling**: **Gemini AI** acts as a "Confidential Financial Structurer" inside the TEE, analyzing bond consistency and generating a **Cipher Hash** to seal the issuance parameters before they reach the blockchain.
- **Stage 3: SVR-Protected Price Feeds (Anti-MEV)**:
    - **Confidential Market Ingestion**: Stablecoin price feeds (USDC-USD) are fetched using Confidential HTTP with **SVR (Secure Variable Reading)** enabled. This prevents MEV attacks and keeps the heartbeat of our RWA health monitoring entirely private.
- **Stage 4: Private Auctions & "Ticket Issuance" (The Masterpiece)**:
    - **Sealed-bid Engine**: Bids are submitted as private intents. Price discovery logic executes in shielded RAM, preventing front-running and volume leakage.
    - **Superior Settlement**: We improved upon the standard Chainlink transfer demos by implementing a **TEE-signed Ticket System**. The Enclave determines the winner and generates cryptographically signed `Withdrawal Tickets` (signed via **signEth**). The **StealthVaultEscrow** contract only honors intents authorized by this specific TEE enclave, ensuring absolute privacy in settlement.
- **Stage 5: Dual-Source Private AML**:
    - **Global & Local Screening**: The TEE performs simultaneous, private API calls to **CheckCryptoAddress** and local AML databases using Confidential HTTP. This allows for high-stakes wallet screening without revealing a user's transaction history to third-party oracles.
- **Stage 6: Encrypted Regulatory Reporting (ACE Secure Envelope)**:
    - **Threshold Encryption**: Reports are formatted into an **ACE Secure Envelope** (AES-256-GCM) inside the TEE.
    - **Authorized Access**: Only a specific regulatory wallet (**SUNAVAL**) can trigger the TEE decryption process. The decryption key never leaves the Enclave, providing a perfect balance between institutional privacy and verifiable auditability.

### 4. Risk & Compliance (Institutional Algorithmic Safeguards)
In an institutional market, **Algorithmic Compliance** is the only way to ensure the integrity of the ecosystem. StealthBond LATAM integrates technical guardrails across the entire bond lifecycle, shifting from manual oversight to proactive enclave-enforced rules.

- **Stage 1: Foundational Compliance (CCID + ACE Core)**: 
    - **Multi-Source Validation**: We combine **SENIAT** (fiscal identity), **Gemini AI** (document fraud detection), and **GLEIF** (entity cross-referencing) to issue a high-integrity **CCID**.
    - **ACE Anchoring**: This CCID is anchored in **Chainlink ACE-compatible** smart contracts, establishing a robust, identity-gated environment from the start.
- **Stage 2: Issuer Integrity & ERC-3643 Rules**:
    - **Gated Issuance**: Bond emission is strictly reserved for verified corporations with a valid CCID.
    - **Native Safeguards**: Tokens are deployed as **ERC-3643** compliant assets, where compliance rules are baked into the smart contracts. **Gemini AI** performs real-time validation of the reserves backing each issuance.
- **Stage 3: Verified Participation**: 
    - **Universal CCID Enforcement**: To acquire or hold tokens, every participant—whether human, company, or AI—must hold a correctly issued **CCID**, ensuring a fully permissioned and compliant primary distribution.
- **Stage 4: Secondary Market Gating**:
    - **Persistent Compliance**: The secondary market maintains the same high standards; only CCID-verified actors can participate in auctions, preserving the institutional integrity of the price discovery process.
- **Stage 5: Dynamic Threat Mitigation (Policy Manager)**:
    - **Global Enforcement**: Simultaneous private checks against **OFAC** and international sanctions lists allow for immediate action. 
    - **Automated Isolation**: The **ACE Policy Manager** triggers a mandatory `setAddressFrozen()` for any high-risk actor, preventing illicit fund movement and protecting the protocol in real-time.
- **Stage 6: Institutional Transparency & Auditability**:
    - **Authorized Oversight**: High-level regulators (**SUNAVAL**) possess a unique observer role. Using the TEE, they can perform cryptographically secure audits and supervisory actions, fostering institutional trust through unparalleled transparency.

---

## 📂 Project Navigation

- 📂 **`codigo/cre-project`**: The "Brain" — TEE-optimized Workflows (TypeScript/WASM).
- 📂 **`codigo/blockchain`**: The "Anchor" — Keystone-native smart contracts (Solidity/Foundry).
- 📂 **`codigo/core-engine`**: The "Sync" — Node.js orchestrator bridging UI and CRE.
- 📂 **`codigo/frontend`**: The "Face" — Premium Glassmorphism Dashboard for Investors & Regulators.
- 📂 **`Documentacion/`**: Detailed research papers on GLEIF, x402, and ACE architecture.

---

## ✨ Business Innovation: The "Effect WOW"
StealthBond LATAM is more than a technical solution; it is a strategic leap toward a modernized, secure, and transparent global financial market. Our innovation generates a positive impact by solving critical institutional problems through the "Effect WOW."

1.  **Unified Institutional Market**: We enable a global arena where **individuals, corporations, and autonomous AI agents** interact within a single, high-standard ecosystem. Every participant operates with a real digital identity verified by global and local standards (**GLEIF, SENIAT, AML, Gemini**).
2.  **Regulated RWA Acquisition**: Acquisition of tokenized bonds is native to the blockchain using **stablecoins**, but with a crucial difference: regulatory compliance is not a manual check, but an algorithmic rule embedded in the asset itself.
3.  **The AI Economic Consultant (x402)**: We pioneer the integration of **x402 micro-payments and Gemini AI** to create a professional investment consultancy layer. This allows autonomous agents to receive expert strategy reports, opening a new economic frontier for agentic finance.
4.  **Absolute Privacy in Secondary Markets**: Our **Sealed-bid Auction** mechanism ensures total price and strategy privacy for all participants. By keeping volume and bids off-ledger until settlement, we eliminate front-running and protect institutional interests.
5.  **Preventive Threat Response**: The application doesn't just record activity; it reacts. Through **Confidential Compute**, we detect and block malicious interactions **preventively**, ensuring market stability before risks can escalate.
6.  **Institutional Supervision & Auditability**: We bridge the gap between decentralization and oversight. Our unique **Supervisor Role** allows regulators (**SUNAVAL**) to perform cryptographically secure audits in real-time, fostering global trust and absolute transparency.

### 👥 Roles & Institutional Participants
The ecosystem is built on the **CCID Standard**, ensuring that every actor is verified and accountable within a compliant framework.

#### **On-Chain Roles (CCID Enabled)**
- **People**: Individuals authorized to acquire tokens in both primary and secondary markets. They possess the capability to initiate private auctions in the secondary market.
- **Companies**: The only entities authorized for the **Primary Issuance of RWA Bonds**. They must maintain a corporate CCID to interact with the issuance factory.
- **AI Agents**: Autonomous participants capable of acquiring bonds. Their operation is strictly linked to a **Responsible Tutor** (Human or Company) who must hold a valid CCID for the agent's registration.

#### **External Infrastructure (Off-Chain Data Providers)**
We bridge the gap between traditional finance and the blockchain through high-fidelity API integrations:
- **SENIAT (Fiscal Regulator - VE)**: Provides validation of real-world fiscal compliance. (Functional API).
- **GLEIF (Global LEI Foundation)**: An official Chainlink partner providing international business identity standards (LEI) for verifiable digital onboarding. (**Official API**).
- **CryptoAddress (Scam/Fraud Monitor)**: An international organization that monitors wallets in real-time to prevent illicit activities and fraud. (**Official API**).
- **OFAC (US Treasury)**: The Office of Foreign Assets Control provides critical financial intelligence and sanctions lists for global compliance. (Functional API).
- **Banking Custodian**: A participant responsible for the secure custody of the off-chain reserves backing each bond issuance. (Functional API).

#### **Regulatory Oversight**
- **SUNAVAL (National Securities Superintendency)**: The primary regulator in Venezuela. In our ecosystem, SUNAVAL holds a unique **Auditor Role**, allowing them to supervise on-chain reports for high-value transactions (> USDC 1,000) and verify the **Proof of Reserve (PoR)** status of all active bonds.

---

## 🚀 Quick Start (Simulation Mode)

Experience StealthBond LATAM in your local environment:

### 1. Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Node.js v20+](https://nodejs.org/)
- [Chainlink CRE CLI](https://docs.chain.link/cre)

### 2. Execution Steps
Open 4 terminals and run the following:

**Terminal 1: Blockchain (Anvil)**
```powershell
cd codigo/blockchain
anvil --state ../anvil-state.json
```

**Terminal 2: Smart Contract Setup**
```powershell
cd codigo/blockchain
# Deploy ACE Infrastructure, Bond Factory, and Market Escrows
forge script script/Deploy.s.sol:DeployStage1 --rpc-url http://127.0.0.1:8545 --broadcast
forge script script/DeployStealthBond.s.sol:DeployStealthBond --rpc-url http://127.0.0.1:8545 --broadcast --via-ir
forge script script/DeployStage4.s.sol:DeployStage4 --rpc-url http://127.0.0.1:8545 --broadcast --via-ir
```

**Terminal 3: Core Engine (Backend)**
```powershell
cd codigo/core-engine
npm install && node server.js
```

**Terminal 4: Frontend**
```powershell
cd codigo/frontend
npx serve -l 3000
```

---

## 🏗️ Deep Dive Architecture
For a granular breakdown of our TEE sequence diagrams and CCID derivation logic:
👉 **[Read the TECHNICAL_SPEC.md](codigo/TECHNICAL_SPEC.md)**

---

© 2026 StealthBond LATAM - Built for the **Chainlink "CRE-ate the future" Hackathon**.
