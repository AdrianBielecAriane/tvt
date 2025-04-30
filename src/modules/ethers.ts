import { ethers, Interface } from 'ethers';
import { Network } from './config';
import { Hedera } from './hedera';
import { TransactionRequest } from 'ethers';
import { invariant } from '../utils/invariant';
import { EthereumTransaction, Hbar } from '@hashgraph/sdk';
import { AssumptionObject } from '../methods';
import { HederaWallet } from './hedera-wallet';
import { randomInteger } from 'remeda';
import { sleep } from '../utils/sleep';
import chalk from 'chalk';

const rpcsDetails: Record<Network, { url: string; chainId: number }> = {
  mainnet: { url: 'https://mainnet.hashio.io/api', chainId: 295 },
  testnet: { url: 'https://testnet.hashio.io/api', chainId: 296 },
  localnet: { url: 'http://localhost:7546/api', chainId: 298 },
};
export class Ethers {
  provider;
  wallet;
  hedera;
  nonce;
  isNonceError = false;

  private constructor(hedera: Hedera, nonce: number, provider: ethers.Provider) {
    this.provider = provider;
    this.wallet = new ethers.Wallet(hedera.operatorKey.toStringRaw(), provider);
    this.hedera = hedera;
    this.nonce = nonce;
  }

  static async create(hedera: Hedera) {
    const rpcDetails = rpcsDetails[hedera.config.network];
    const provider = new ethers.JsonRpcProvider(rpcDetails.url);
    const nonce = await provider.getTransactionCount(`0x${hedera.operatorId.toSolidityAddress()}`, 'latest');
    return new Ethers(hedera, nonce, provider);
  }

  async refetchNonce() {
    this.nonce = await this.provider.getTransactionCount(`0x${this.hedera.operatorId.toSolidityAddress()}`, 'latest');
    this.isNonceError = false;
  }

  async createRawTransaction(target: HederaWallet): Promise<AssumptionObject> {
    if (this.isNonceError) {
      await sleep(5000);
    }

    // Minimalize issue related to wrong nonce
    const timeoutTime = randomInteger(1, 5000);
    await sleep(timeoutTime);

    const abi = ['function transfer(address to, uint amount)'];
    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = await this.provider.getFeeData();
    const { chainId } = await this.provider.getNetwork();
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData('transfer', [
      `0x${target.accountId.toSolidityAddress()}`,
      ethers.parseEther('0.01'),
    ]);
    invariant(gasPrice, 'Gas price not exist');
    const tx = {
      nonce: this.nonce++,
      gasLimit: 250000,
      maxPriorityFeePerGas,
      maxFeePerGas,
      to: `0xe9e7cea3dedca5984780bafc599bd69add087d56`,
      value: 1,
      data,
      chainId, // Hedera network chain id
    } satisfies TransactionRequest;
    const signedTx = await this.wallet.signTransaction(tx);
    const transaction = new EthereumTransaction({
      maxGasAllowance: new Hbar(1),
      ethereumData: Buffer.from(signedTx.slice(2), 'hex'),
    });
    const txResponse = await transaction.execute(this.hedera.client);

    try {
      await txResponse.getReceipt(this.hedera.client);
    } catch (e) {
      if (this.isNonceError) {
        throw e;
      }
      this.isNonceError = true;
      console.log(chalk.red('Blocking eth transactions, repairing nonce'));
      await sleep(3000);
      await this.refetchNonce();
      this.isNonceError = false;
      throw e;
    }
    const record = await txResponse.getRecord(this.hedera.client);

    return {
      fee: record.transactionFee,
      transactionId: txResponse.transactionId.toString(),
      type: 'ETHEREUM_TRANSACTION',
    };
  }
}
