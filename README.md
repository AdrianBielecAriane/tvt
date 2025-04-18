# TVT – Transaction Volume Toolkit (Hedera CLI Utility)

**TVT** is an interactive command-line application for performing and analyzing transactions on the **Hedera Hashgraph** network. It's designed to be easy for both business users and developers.

---

## 🔍 Overview

**What it is:**

- A **CLI tool** that helps users perform blockchain actions like token minting, file storage, contract calls, etc.

**Purpose:**

- Analyze transaction costs
- Automate batch operations
- Understand Hedera network capabilities

**Main Features:**

- Interactive menu-driven UI
- Batch operations with quantity control
- Multi-network support: Mainnet, Testnet, Localnet
- Auto-setup of Hedera resources (tokens, accounts, files, etc.)
- CSV reporting with fee summary in HBAR & USD

**Who it’s for:**

- **Business Users:** No coding needed; simple insights into transaction costs
- **Developers:** Full code access, modifiable, and ideal for testing

---

## 🚀 Getting Started (User Guide)

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- Hedera Account ID + Private Key (get one from [Hedera Portal](https://portal.hedera.com/))

### Installation

```bash
git clone https://github.com/AdrianBielecAriane/tvt.git
cd tvt
pnpm i
```

### Running

```bash
pnnpm start
```

TVT will:

1. Ask for network (Mainnet/Testnet/Localnet)
2. Prompt for Hedera Account ID and Private Key
3. Initialize Hedera resources (account, token, topic, file, contract)
4. Launch menu of actions to perform

### Actions Available

- Approve allowance
- Transfer HBAR
- Token associate
- File append
- Contract call
- Mint / Burn token
- Submit message to topic
- Create account

### Report Output

After executing actions, TVT creates:

- `raports/detailed-raport.csv` — per transaction data
- `raports/raport.csv` — summary by type (with HBAR & USD fees)

---

## 📂 Developer Guide

### Project Structure

- Written in **TypeScript**, using the **Hedera JavaScript SDK**
- Modules:
  - `hedera-token.ts` – token logic
  - `hedera-file.ts` – file storage
  - `hedera-contract.ts` – smart contract support
  - `hedera-topic.ts` – message topics
  - `config.ts` – environment setup
  - `methods.ts` – main interface for CLI logic

### Scripts

- Run tool: `pnpm start`
- Uses [tsx](https://www.npmjs.com/package/tsx) for TypeScript execution

### Configuration

- Automatically generated `config.json`
- Contains credentials and Hedera IDs
- Use config variables for automation (`TVT_NETWORK`, `TVT_TESTNET_OPERATOR_ID`, etc.)

---

<sub>_Last updated: April 18, 2025_</sub>
