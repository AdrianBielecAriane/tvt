import { ethers } from 'ethers';
import { Network } from './config';
import { Hedera } from './hedera';
import { TransactionRequest } from 'ethers';
import { invariant } from '../utils/invariant';
import { EthereumTransaction, Hbar } from '@hashgraph/sdk';
import { AssumptionObject } from '../methods';
import { HederaWallet } from './hedera-wallet';

const rpcsDetails: Record<Network, { url: string; chainId: number }> = {
  mainnet: { url: 'https://mainnet.hashio.io/api', chainId: 295 },
  testnet: { url: 'https://testnet.hashio.io/api', chainId: 296 },
  localnet: { url: 'http://localhost:7546/api', chainId: 298 },
};

//TODO: not works
export class Ethers {
  provider;
  wallet;
  hedera;
  constructor(hedera: Hedera) {
    const rpcDetails = rpcsDetails[hedera.config.network];
    this.provider = new ethers.JsonRpcProvider(rpcDetails.url);
    this.wallet = new ethers.Wallet(hedera.operatorKey.toStringRaw(), this.provider);
    this.hedera = hedera;
  }

  async createRawTransaction(target: HederaWallet): Promise<AssumptionObject> {
    const nonce = await this.provider.getTransactionCount(this.wallet.address);
    const { gasPrice } = await this.provider.getFeeData();
    const { chainId } = await this.provider.getNetwork();
    invariant(gasPrice, 'Gas price not exist');
    const tx = {
      nonce,
      gasLimit: 210000000,
      to: `0x${target.accountId.toSolidityAddress()}`,
      value: ethers.parseEther('0.01'),
      type: 2,
      maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
      maxFeePerGas: ethers.parseUnits('10', 'gwei'),
      chainId, // Hedera network chain id
    } satisfies TransactionRequest;
    const signedTx = await this.wallet.signTransaction(tx);
    const transaction = new EthereumTransaction({
      maxGasAllowance: new Hbar(2000),
      ethereumData: Buffer.from(signedTx.slice(2), 'hex'),
    });

    const txResponse = await transaction.execute(this.hedera.client);
    const record = await txResponse.getRecord(this.hedera.client);
    return {
      fee: record.transactionFee,
      transactionId: txResponse.transactionId.toString(),
      type: 'ETHEREUM_TRANSACTION',
    };
  }
}
