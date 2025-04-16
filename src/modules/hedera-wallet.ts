import {
  AccountCreateTransaction,
  AccountId,
  AccountUpdateTransaction,
  Hbar,
  HbarUnit,
  PrivateKey,
  TokenAssociateTransaction,
  TransferTransaction,
} from '@hashgraph/sdk';
import * as R from 'remeda';
import { HederaNftClass, HederaToken } from './hedera-token';
import { Hedera } from './hedera';
import { invariant } from '../utils/invariant';
import { AssumptionObject } from '../methods';

export class HederaWallet {
  associatedTokens: string[] = [];
  privateKey;
  accountId;
  hedera;
  createFee: Hbar;

  private constructor(accountId: AccountId, privateKey: PrivateKey, hedera: Hedera, createFee: Hbar) {
    this.privateKey = privateKey;
    this.accountId = accountId;
    this.hedera = hedera;
    this.createFee = createFee;
  }

  static async create(hedera: Hedera, initialBalance = 2) {
    const pk = PrivateKey.generateECDSA();
    const transaction = new AccountCreateTransaction()
      .setKeyWithoutAlias(pk.publicKey)
      .setInitialBalance(new Hbar(initialBalance));
    const txResponse = await transaction.execute(hedera.client);
    const receipt = await txResponse.getReceipt(hedera.client);
    invariant(receipt.accountId, 'Account id not found');
    const record = await txResponse.getRecord(hedera.client);
    return new HederaWallet(receipt.accountId, pk, hedera, record.transactionFee);
  }

  isTokenAssociated(token: HederaToken) {
    return this.associatedTokens.some((t) => token.tokenId.toString() === t);
  }

  async transferHBars(
    to: HederaWallet | [HederaWallet, ...HederaWallet[]],
    token?: HederaNftClass
  ): Promise<AssumptionObject> {
    const validTo = Array.isArray(to) ? to : [to];
    const amount = 1;
    console.log(
      `Transferring ${amount} HBars from ${this.accountId.toString()} to ${validTo
        .map((to) => to.accountId.toString())
        .join(',')}`
    );

    let transaction = new TransferTransaction().addHbarTransfer(
      this.accountId,
      new Hbar(-(amount * validTo.length), HbarUnit.Tinybar)
    );

    for (const to of validTo) {
      transaction = transaction.addHbarTransfer(to.accountId, new Hbar(amount, HbarUnit.Tinybar));
    }
    if (token) {
      const index = R.randomInteger(0, validTo.length - 1);
      const wallet = validTo[index];
      if (wallet) {
        await wallet.associateToken(token.token);
        transaction = transaction.addNftTransfer(token.token.tokenId, token.serial, this.accountId, wallet.accountId);
      }
    }

    transaction = transaction.freezeWith(this.hedera.client);
    const signedTx = await transaction.sign(this.privateKey);
    const txResponse = await signedTx.execute(this.hedera.client);
    const receipt = await txResponse.getReceipt(this.hedera.client);
    const transactionStatus = receipt.status;
    const record = await txResponse.getRecord(this.hedera.client);
    console.log('The transaction consensus status is ' + transactionStatus.toString());
    return { fee: record.transactionFee, type: 'CRYPTO_TRANSFER' };
  }

  async associateToken(token: HederaToken): Promise<AssumptionObject> {
    console.log(`associating token: ${token.tokenId.toString()} to ${this.accountId.toString()}`);
    const transaction = new TokenAssociateTransaction()
      .setTokenIds([token.tokenId])
      .setAccountId(this.accountId)
      .freezeWith(this.hedera.client);

    const signTx = await transaction.sign(this.privateKey);
    const txResponse = await signTx.execute(this.hedera.client);
    await txResponse.getReceipt(this.hedera.client);
    this.associatedTokens.push(token.tokenId.toString());
    const record = await txResponse.getRecord(this.hedera.client);
    return { fee: record.transactionFee, type: 'TOKEN_ASSOCIATE' };
  }
}
