import { AccountBalanceQuery, AccountId, Client, HbarUnit, PrivateKey } from '@hashgraph/sdk';
import { Config } from './config';
import { z } from 'zod';
import { HederaContract } from './hedera-contract';

export type ConfigPrefix = ReturnType<Hedera['getPrefix']>;

interface GetContractResult {
  transactionId: string;
}

interface GetGasPrice {
  transactionId: string;
}

const contractResultSchema = z.object({
  gas_consumed: z.number(),
  gas_used: z.number(),
});

const gasPriceSchema = z.object({
  fees: z.array(
    z.union([
      z.object({ gas: z.number(), transaction_type: z.literal('ContractCall') }),
      z.object({ gas: z.number(), transaction_type: z.literal('ContractCreate') }),
      z.object({ gas: z.number(), transaction_type: z.literal('EthereumTransaction') }),
    ])
  ),
});

export class Hedera {
  client: Client;
  config: Config['config'];
  operatorKey: PrivateKey;
  operatorId: AccountId;
  private apiUrl: string;

  constructor({ config }: Config) {
    this.config = config;
    if (config.network === 'localnet') {
      const node = { [`${config.networkIp}:50211`]: new AccountId(3) };
      this.client = Client.forNetwork(node).setMirrorNetwork(`${config.networkIp}:5600`);
    } else {
      this.client = Client[config.network === 'mainnet' ? 'forMainnet' : 'forTestnet']();
    }

    this.operatorId = AccountId.fromString(config.operatorId);
    if (config.operatorKeyType === 'ECDSA') {
      this.operatorKey = PrivateKey.fromStringECDSA(config.operatorKey);
    } else {
      this.operatorKey = PrivateKey.fromStringED25519(config.operatorKey);
    }

    this.client.setOperator(this.operatorId, this.operatorKey);
    if (this.config.network === 'mainnet') {
      this.apiUrl = 'https://mainnet.mirrornode.hedera.com/api/v1';
    } else if (this.config.network === 'testnet') {
      this.apiUrl = 'https://testnet.mirrornode.hedera.com/api/v1';
    } else {
      this.apiUrl = 'http://localhost:5551/api/v1';
    }
  }

  getPrefix() {
    const { network } = this.config;
    const shortcut = network === 'localnet' ? 'LOCAL' : network === 'mainnet' ? 'MAINNET' : 'TESTNET';
    const prefix = `TVT_${shortcut}` as const;
    return prefix;
  }

  async getCustodianBalance() {
    const query = new AccountBalanceQuery().setAccountId(this.operatorId);
    const accountBalance = await query.execute(this.client);
    return accountBalance.hbars.to(HbarUnit.Hbar);
  }

  async getGasPrice({ transactionId }: GetGasPrice) {
    const timestamp = transactionId.split('@')[1];
    const response = await fetch(`${this.apiUrl}/network/fees?timestamp=${timestamp}`);

    if (!response.ok) {
      throw new Error('Failed to get gas price');
    }
    const body = await response.json();
    return gasPriceSchema.parse(body);
  }

  async getContractResult({ transactionId }: GetContractResult) {
    const response = await fetch(`${this.apiUrl}/contracts/results/${transactionId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to query contract');
    }
    const body = await response.json();
    return contractResultSchema.parse(body);
  }
}
