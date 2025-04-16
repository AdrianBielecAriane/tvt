import { AccountBalanceQuery, AccountId, Client, HbarUnit, PrivateKey } from '@hashgraph/sdk';
import { Config } from './config';

export class Hedera {
  client: Client;
  private config: Config['config'];
  operatorKey: PrivateKey;
  operatorId: AccountId;

  constructor({ config }: Config) {
    this.config = config;
    if (config.network === 'localnet') {
      const node = { [`${config.networkIp}:50211`]: new AccountId(3) };
      this.client = Client.forNetwork(node).setMirrorNetwork(`${config.networkIp}:5600`);
    } else {
      this.client = Client[config.network === 'mainnet' ? 'forMainnet' : 'forTestnet']();
    }

    console.log(config.operatorId);
    this.operatorId = AccountId.fromString(config.operatorId);
    this.operatorKey = PrivateKey.fromStringECDSA(config.operatorKey);

    this.client.setOperator(this.operatorId, this.operatorKey);
  }

  async getCustodianBalance() {
    const query = new AccountBalanceQuery().setAccountId(this.operatorId);
    const accountBalance = await query.execute(this.client);
    return accountBalance.hbars.to(HbarUnit.Hbar);
  }
}
