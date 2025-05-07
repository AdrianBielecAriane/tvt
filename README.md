# TVT – Transaction Validator Tool (Hedera CLI Utility)

**TVT** is a command-line utility for validating Hedera network transactions and generating detailed reports on transaction costs. It is designed to be easy to use for both technical and non-technical users. The tool is distributed as a Dockerized application and includes a bash script (run.sh) for simplifying the setup and execution of transaction validation tasks

---

## System Requirements

System Requirements
Hedera Account: Before using TVT, you will need a Hedera account (for Testnet or Mainnet) and its corresponding private key. You can obtain a Testnet account for free from the Hedera Portal (an account ID looks like 0.0.xxxx and the private key is a long string starting with 302e02...). Keep these credentials ready. Docker: TVT is distributed as a Dockerized application, so you need Docker installed on your system. Docker allows running the tool without installing Node.js or any dependencies on your host. Below are the platform-specific requirements and installation instructions for Docker:
Windows: Docker Desktop for Windows (Windows 10 or 11, 64-bit). Ensure your Windows system meets Docker’s requirements: 64-bit processor with virtualization support (enabled in BIOS) and at least 4 GB RAM
docs.docker.com

- Windows 10 Home or Pro version 22H2 (build 19045) or later is recommended, with the WSL2 feature enabled for best compatibility.
  **Installation**: Download Docker Desktop for Windows from the official Docker website and run the installer. During installation, enable WSL2 integration if prompted (Docker will guide you through this). After installation, restart if required. You should see the Docker whale icon in your system tray; you can verify installation by opening a terminal (PowerShell or Command Prompt) and running docker --version.
- macOS: Docker Desktop for Mac. Requires macOS 10.15 (Catalina) or newer on a 64-bit CPU. Both Intel and Apple Silicon (M1/M2) Macs are supported (download the appropriate Docker Desktop package for your architecture). Ensure you have at least 4 GB of RAM available
  docs.docker.com
  **Installation**: Download Docker Desktop for Mac from Docker’s website. Open the .dmg file and drag the Docker.app to your Applications folder. Launch Docker.app and allow it to finish setting up. You might be prompted to install additional components (like Rosetta 2 on Apple Silicon for certain support tools – follow any prompts). Once the Docker icon appears in the menu bar, you can confirm installation by running docker --version in Terminal.
- Linux: Docker Engine (Community Edition). Requires a 64-bit Linux kernel and distribution (modern distributions like Ubuntu 18.04+, Debian, Fedora, etc., are supported) and 4 GB+ RAM is recommended. You will need root or sudo privileges to install Docker.
  **Installation**: On Debian/Ubuntu-based systems, you can install Docker using the package manager. For example:

```bash
sudo apt update
sudo apt install -y docker.io
```

This installs Docker from the default repositories (which is sufficient for most uses). For the latest version, you may install docker-ce from Docker’s official repository (see Docker’s docs for your distro). After installation, ensure your user is in the “docker” group or use sudo for docker commands. Verify by running docker --version. On other distributions, refer to Docker’s official installation guide for the specific steps.

Note: Docker typically requires administrative privileges. On Windows and Mac, Docker Desktop will manage this for you. On Linux, consider adding your user to the docker group (sudo usermod -aG docker $USER) to run docker without sudo (you will need to re-login for this to take effect).

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

### Getting Started with TVT (Docker Usage)

Once Docker is installed and your Hedera credentials are ready, you can set up and run the Transaction Validator Tool. The following steps will guide you through downloading (or building) the Docker image and running the application.

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

### Understanding the Output Reports

After each run, TVT produces two CSV files summarizing the transactions executed:

- Detailed Report (detailed-report.csv): This report lists each transaction that was performed, with details per transaction. Columns include the transaction ID, type of transaction, fee paid (in HBAR), gas used (if applicable), total gas fee, and a Hashscan link to view that transaction on the Hedera network explorer

Each row corresponds to a single transaction. For example, if you ran 1 of each action, this file will have one row per action type; if you ran multiple (--quantity > 1), it will list every single transaction instance. This detailed report is useful to see individual transaction costs and identifiers.

- Summary Report (report.csv): This report is an aggregate summary grouped by transaction type. For each type of action (e.g., HBAR transfer, token mint, file append, etc.), it shows:
- The number of transactions of that type executed (Count).
- Total fee in USD for all those transactions combined.
- Average gas price (USD) and average gas consumed (USD) for gas-using transactions.
- The scheduled fee for that transaction type (in USD) and the difference between the actual average fee and the scheduled fee (both as an amount and a percentage).
- Statistical metrics: average fee, standard deviation, maximum fee, 25th percentile, median, 75th percentile (all in USD), and an indication of which statistic the actual fee was closest to (“Actl closer to” column).

## Gas-Heavy Transactions and Variable Fees

Some transaction types on Hedera involve gas fees (for example, Smart Contract Calls and Ethereum Transactions on Hedera). These are considered “gas-heavy” operations because their fee is not a fixed value – it depends on the amount of gas used and the network gas price at the time of execution.

In the context of TVT’s reports, you may notice that for such gas-dependent transaction types, the fee comparison column (related to scheduled fees) may show “N/A (Gas Dependent)” or “Variable” instead of a concrete number. This is intentional. It indicates that a direct comparison to a single scheduled fee is not applicable, since the cost largely comes from gas consumption which varies per transaction.

For example, a contract call’s total fee consists of a base service fee plus a fee proportional to the gas used by that contract execution. The scheduled fee in Hedera’s fee schedule for a contract call might only cover the base part, while the actual fee can vary widely depending on how much gas was required (which in turn depends on the complexity of the contract code executed).

> **Note:** Actual fee is highly variable based on network conditions and gas usage; the “scheduled” fee listed serves as a minimum baseline. In other words, for gas-heavy transactions, expect the real fees to be higher and to fluctuate. The tool will mark these cases accordingly, to remind you that the comparison with a fixed scheduled fee isn't straight-forward.

When reviewing the summary report, keep this in mind for the entries like CONTRACT_CALL or ETHEREUM_TRANSACTION:

- The "Schedule fee (USD)" column might represent only the base fee. Any gas costs will cause the actual fee to exceed this.
- The "Schedule fee difference" might be marked as not applicable or simply be very large, since gas can make the actual fee much larger than the base fee.

Always consider gas-heavy transactions as having variable fees. The provided data (like average gas price and gas used) in the report will help you understand how much gas contributed to the cost. If you see "N/A" or "Variable" in the fee difference, refer to the detailed report for the exact fees and gas used per transaction.

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
