# TVT – Transaction Validator Tool (Hedera CLI Utility)

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

### Running

```bash
git clone https://github.com/AdrianBielecAriane/tvt.git
docker build -t tvt .
docker run tvt --network=testnet --quantity=1
```

All logs are saved by default at your home dir in `tvt` folder.
To copy you have to run command

### Args

Command allows us to insert such commands:

- --quantity(required) - **How many times transactions will repat**
- --network(required) - There are available three networks
  - mainnet
  - testnet
  - localnet
- --scheduler
  Scheduler is based on nodejs package: https://www.npmjs.com/package/cron
  To run scheduler you have to pass cron pattern value

  - `*` Asterisks: Any value
  - `1-3,5` Ranges: Ranges and individual values
  - `*/2` Steps: Every two units
    ```bash
    field allowed values
    second 0-59
    minute 0-59
    hour 0-23
    day of month 1-31
    month 1-12 (or names, see below)
    day of week 0-7 (0 or 7 is Sunday, or use names)
    ```

- --stop-after
  - Allowed time formats are: m, h, d, w
  - Tha value must be in format f.e 2w (then scheduler will be stopped after 2 weeks)
- --key-type
  - ECDSA(defauly),
  - ED25519
    You can change which key you would like to use your operator
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

- `reports/detailed-report.csv` — per transaction data
- `reports/report.csv` — summary by type (with HBAR & USD fees)

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

```

```
