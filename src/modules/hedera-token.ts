import {
  NftId,
  Status,
  TokenBurnTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenMintTransaction,
  TokenNftInfoQuery,
  TokenSupplyType,
  TokenType,
} from '@hashgraph/sdk';
import * as R from 'remeda';
import { Hedera } from './hedera';
import { invariant } from '../utils/invariant';
import { HederaWallet } from './hedera-wallet';
import { AssumptionObject } from '../methods';
import { getEnv } from './config';

interface Mint {
  nft: HederaNft;
  details: AssumptionObject;
}

export class HederaToken {
  serials = new Set<number>();
  tokenId;
  isPaused = false;
  hedera: Hedera;

  private constructor(tokenId: TokenId, hedera: Hedera) {
    this.tokenId = tokenId;
    this.hedera = hedera;
  }

  static async create(hedera: Hedera) {
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

    let tokenId = nftCreateRx.tokenId;
    invariant(tokenId, 'Token id not found');
    return new HederaToken(tokenId, hedera);
  }

  static async init(hedera: Hedera) {
    const prefix = hedera.getPrefix();
    const tokenId = getEnv({ prefix, key: 'TOKEN_ID' });
    if (tokenId) {
      try {
        const token = new HederaToken(TokenId.fromString(tokenId), hedera);
        const nft = await HederaNft.init(token, hedera);
        return { token, nft };
      } catch {
        const token = await HederaToken.create(hedera);
        const { nft } = await token.mint();
        return { token, nft };
      }
    }
    const token = await HederaToken.create(hedera);
    const { nft } = await token.mint();
    return { token, nft };
  }

  async mint(): Promise<Mint> {
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
    return {
      nft: new HederaNft(firstSerial, this, this.hedera),
      details: { fee: record.transactionFee, transactionId: mintTxSubmit.transactionId.toString(), type: 'TOKEN_MINT' },
    };
  }
}

export type HederaNftClass = HederaNft;

class HederaNft {
  // By default NFT will be associated to treasure acc
  owner?: HederaWallet;
  serial;
  token;
  hedera;

  constructor(serial: number, token: HederaToken, hedera: Hedera) {
    this.serial = serial;
    this.token = token;
    this.hedera = hedera;
  }

  static async init(token: HederaToken, hedera: Hedera) {
    await new TokenNftInfoQuery().setNftId(new NftId(new TokenId(token.tokenId), 1)).execute(hedera.client);
    return new HederaNft(1, token, hedera);
  }

  async burn(): Promise<AssumptionObject> {
    const transaction = new TokenBurnTransaction()
      .setTokenId(this.token.tokenId)
      .setSerials([this.serial])
      .freezeWith(this.hedera.client);

    const signTx = await transaction.sign(this.hedera.operatorKey);
    const txResponse = await signTx.execute(this.hedera.client);
    const response = await txResponse.getReceipt(this.hedera.client);
    const record = await txResponse.getRecord(this.hedera.client);
    if (response.status === Status.Success) {
      this.token.serials.delete(this.serial);
    }
    return { type: 'TOKEN_BURN', fee: record.transactionFee, transactionId: txResponse.transactionId.toString() };
  }
}
