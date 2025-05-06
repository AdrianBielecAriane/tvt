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
  nft: HederaNft | null;
  details: AssumptionObject;
}

type Type = 'NFT' | 'FT';

export class HederaToken {
  serials = new Set<number>();
  tokenId;
  isPaused = false;
  hedera: Hedera;
  type: Type;

  private constructor(tokenId: TokenId, hedera: Hedera, type: Type) {
    this.tokenId = tokenId;
    this.hedera = hedera;
    this.type = type;
  }

  static async create(hedera: Hedera, type: Type) {
    let nftCreateTx = new TokenCreateTransaction()
      .setTokenName(`ETL Token ${type}`)
      .setTokenSymbol('ETL')
      .setTokenType(type === 'NFT' ? TokenType.NonFungibleUnique : TokenType.FungibleCommon)
      .setDecimals(type === 'FT' ? 2 : 0)
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
    return new HederaToken(tokenId, hedera, type);
  }

  static async init(hedera: Hedera) {
    const prefix = hedera.getPrefix();
    const tokenId = getEnv({ prefix, key: 'TOKEN_ID' });
    let nonFungibleToken;
    let nft;
    if (tokenId) {
      try {
        nonFungibleToken = new HederaToken(TokenId.fromString(tokenId), hedera, 'NFT');
        nft = await HederaNft.init(nonFungibleToken, hedera);
      } catch {
        nonFungibleToken = await HederaToken.create(hedera, 'NFT');
        const minted = await nonFungibleToken.mint();
        nft = minted.nft;
      }
    } else if (!nonFungibleToken || !nft) {
      nonFungibleToken = await HederaToken.create(hedera, 'NFT');
      const minted = await nonFungibleToken.mint();
      nft = minted.nft;
    }

    const ftTokenId = getEnv({ prefix, key: 'FUNGIBLE_TOKEN_ID' });
    let fungibleToken;
    if (ftTokenId) {
      try {
        fungibleToken = new HederaToken(TokenId.fromString(ftTokenId), hedera, 'FT');
      } catch {
        fungibleToken = await HederaToken.create(hedera, 'FT');
      }
    } else {
      fungibleToken = await HederaToken.create(hedera, 'FT');
    }
    return { nonFungibleToken, nft, fungibleToken };
  }

  async mint(): Promise<Mint> {
    let mintTx = new TokenMintTransaction().setTokenId(this.tokenId);
    if (this.type === 'NFT') {
      mintTx = mintTx.addMetadata(new Uint8Array(Buffer.from('ipfs://QmY2b5e5X5W2X5W2X5W2X5W2X5W2X5W2X5W2X5W2X')));
    } else {
      mintTx = mintTx.setAmount(10);
    }
    mintTx = mintTx.freezeWith(this.hedera.client);

    const signedTx = await mintTx.sign(this.hedera.operatorKey);
    let mintTxSubmit = await signedTx.execute(this.hedera.client);
    let mintRx = await mintTxSubmit.getReceipt(this.hedera.client);
    let firstSerial;
    if (this.type === 'NFT') {
      for (const serial of mintRx.serials) {
        firstSerial = serial.low;
        this.serials.add(serial.low);
      }
      invariant(firstSerial, 'Serial not found');
    }
    const record = await mintTxSubmit.getRecord(this.hedera.client);
    return {
      nft: firstSerial ? new HederaNft(firstSerial, this, this.hedera) : null,
      details: {
        fee: record.transactionFee,
        transactionId: mintTxSubmit.transactionId.toString(),
        type: this.type === 'FT' ? 'TOKEN_MINT(FT)' : 'TOKEN_MINT(NFT)',
      },
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
