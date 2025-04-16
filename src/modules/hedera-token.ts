import {
  Hbar,
  PrivateKey,
  Status,
  TokenBurnTransaction,
  TokenCreateTransaction,
  TokenDeleteTransaction,
  TokenId,
  TokenMintTransaction,
  TokenPauseTransaction,
  TokenSupplyType,
  TokenType,
  TokenUnpauseTransaction,
  TokenUpdateTransaction,
  TokenWipeTransaction,
  TransferTransaction,
} from '@hashgraph/sdk';
import * as R from 'remeda';
import { Hedera } from './hedera';
import { invariant } from '../utils/invariant';
import { HederaWallet } from './hedera-wallet';
import { AssumptionObject } from '../methods';
import { getEnv } from './config';

export class HederaToken {
  serials = new Set<number>();
  tokenId;
  isPaused = false;
  hedera: Hedera;
  createFee: Hbar | undefined;

  private constructor(tokenId: TokenId, hedera: Hedera, createFee?: Hbar) {
    this.tokenId = tokenId;
    this.hedera = hedera;
    this.createFee = createFee;
  }

  static async create(hedera: Hedera, omitFee?: boolean) {
    console.log('\n- Creating NFT Token');
    let nftCreateTx = new TokenCreateTransaction()
      .setTokenName('ETL Token')
      .setTokenSymbol('ETL')
      .setTokenType(TokenType.NonFungibleUnique)
      .setDecimals(0)
      .setTreasuryAccountId(hedera.operatorId)
      .setSupplyType(TokenSupplyType.Infinite)
      .setAdminKey(hedera.operatorKey.publicKey)
      .setMetadataKey(hedera.operatorKey.publicKey)
      .setSupplyKey(hedera.operatorKey.publicKey)
      .setPauseKey(hedera.operatorKey.publicKey)
      .setFreezeKey(hedera.operatorKey.publicKey)
      .setWipeKey(hedera.operatorKey.publicKey)
      .freezeWith(hedera.client);

    let nftCreateSubmit = await nftCreateTx.execute(hedera.client);
    let nftCreateRx = await nftCreateSubmit.getReceipt(hedera.client);
    const record = await nftCreateSubmit.getRecord(hedera.client);

    let tokenId = nftCreateRx.tokenId;
    invariant(tokenId, 'Token id not found');
    console.log(`- Created NFT with Token ID: ${tokenId}`);
    return new HederaToken(tokenId, hedera, omitFee ? undefined : record.transactionFee);
  }

  static async init(hedera: Hedera) {
    const prefix = hedera.getPrefix();
    const tokenId = getEnv({ prefix, key: 'TOKEN_ID' });
    if (tokenId) {
      return new HederaToken(TokenId.fromString(tokenId), hedera, undefined);
    }
    return HederaToken.create(hedera, true);
  }

  async mint() {
    console.log(`- Minting ${this.tokenId.toString()} NFT Token`);
    let mintTx = new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .addMetadata(new Uint8Array(Buffer.from(R.randomString(19))))
      .freezeWith(this.hedera.client);

    const signedTx = await mintTx.sign(this.hedera.operatorKey);
    let mintTxSubmit = await signedTx.execute(this.hedera.client);
    let mintRx = await mintTxSubmit.getReceipt(this.hedera.client);
    let firstSerial;
    for (const serial of mintRx.serials) {
      firstSerial = serial.low;
      this.serials.add(serial.low);
    }
    invariant(firstSerial, 'Serial not found');
    const record = await mintTxSubmit.getRecord(this.hedera.client);
    return new HederaNft(firstSerial, this, this.hedera, record.transactionFee);
  }
}

export type HederaNftClass = HederaNft;

class HederaNft {
  // By default NFT will be associated to treasure acc
  owner?: HederaWallet;
  serial;
  token;
  hedera;
  createFee: Hbar;

  constructor(serial: number, token: HederaToken, hedera: Hedera, createFee: Hbar) {
    this.serial = serial;
    this.token = token;
    this.hedera = hedera;
    this.createFee = createFee;
  }

  async burn(): Promise<AssumptionObject> {
    console.log(`burning ${this.token.tokenId.toString()} with serial ${this.serial}`);

    const transaction = new TokenBurnTransaction()
      .setTokenId(this.token.tokenId)
      .setSerials([this.serial])
      .freezeWith(this.hedera.client);

    const signTx = await transaction.sign(this.hedera.operatorKey);
    const txResponse = await signTx.execute(this.hedera.client);
    const response = await txResponse.getReceipt(this.hedera.client);
    const record = await txResponse.getRecord(this.hedera.client);
    console.log(`- Token burn: ${response.status}`);
    if (response.status === Status.Success) {
      this.token.serials.delete(this.serial);
    }
    return { type: 'TOKEN_BURN', fee: record.transactionFee };
  }
}
