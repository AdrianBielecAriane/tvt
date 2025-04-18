import { Hedera } from './modules/hedera';
import { HederaNftClass, HederaToken } from './modules/hedera-token';
import { HederaWallet } from './modules/hedera-wallet';
import {
  AccountAllowanceApproveTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  EthereumTransaction,
  Hbar,
  HbarUnit,
  TransferTransaction,
} from '@hashgraph/sdk';
import { HederaTopic } from './modules/hedera-topic';
import { HederaContract } from './modules/hedera-contract';
import { json2csv } from 'json-2-csv';
import path from 'path';
import { HederaFile } from './modules/hedera-file';
import fs from 'fs/promises';
import { envs } from './modules/config';
import { Ethers } from './modules/ethers';
import { coingekoApi } from './modules/coingeko';

const transactionTypes = [
  'CRYPTO_TRANSFER',
  'CONTRACT_CALL',
  'CONSENSUS_SUBMIT_MESSAGE',
  'TOKEN_MINT',
  'ETHEREUM_TRANSACTION',
  'CRYPTO_APPROVE_ALLOWANCE',
  'TOKEN_BURN',
  'CRYPTO_CREATE_ACCOUNT',
  'TOKEN_ASSOCIATE',
  'FILE_APPEND',
] as const;
type TransactionType = (typeof transactionTypes)[number];

export interface AssumptionObject {
  type: TransactionType;
  transactionId: string;
  fee: Hbar;
}

export class Methods {
  private data = new Map<
    TransactionType,
    {
      transactionId: string;
      fee: Hbar;
    }[]
  >();
  private ethers;
  private receiver: HederaWallet;
  private topic: HederaTopic;
  private token: HederaToken;
  private hedera;
  private contract: HederaContract;
  private file: HederaFile;
  private nft: HederaNftClass;

  private constructor(
    hedera: Hedera,
    topic: HederaTopic,
    contract: HederaContract,
    receiver: HederaWallet,
    token: HederaToken,
    nft: HederaNftClass,
    file: HederaFile,
    ethers: Ethers
  ) {
    this.hedera = hedera;
    this.receiver = receiver;
    this.topic = topic;
    this.contract = contract;
    this.token = token;
    this.nft = nft;
    this.file = file;
    this.ethers = ethers;
  }

  static async create(hedera: Hedera) {
    console.clear();
    console.log('Initializing CLI');
    const prefix = hedera.getPrefix();
    const receiver = await HederaWallet.init(hedera);
    const topic = await HederaTopic.init(hedera);
    const contract = await HederaContract.init(hedera);
    const { token, nft } = await HederaToken.init(hedera);
    const file = await HederaFile.init(hedera);
    const ethers = new Ethers(hedera);

    const config = {
      [`${prefix}_WALLET_ID`]: receiver.accountId.toString(),
      [`${prefix}_TOPIC_ID`]: topic.topicId.toString(),
      [`${prefix}_CONTRACT_ID`]: contract.contractId.toStringWithChecksum(hedera.client),
      [`${prefix}_CONTRACT_FILE_ID`]: contract.file.fileId.toString(),
      [`${prefix}_TOKEN_ID`]: token.tokenId.toString(),
      [`${prefix}_FILE_ID`]: file.fileId.toString(),
    };

    await fs.writeFile('config.json', JSON.stringify({ ...envs, ...config }), {
      encoding: 'utf-8',
    });
    return new Methods(hedera, topic, contract, receiver, token, nft, file, ethers);
  }

  async saveDetailsRaport(hedera: Hedera, folderPath: string) {
    const headers = ['Type', 'Fee', 'Transaction id', 'Hashscan link'];
    const rows: string[][] = [];
    let hashscanUrl;
    if (hedera.config.network === 'localnet') {
      hashscanUrl = `http://${hedera.config.networkIp}:8080/devnet/transaction`;
    } else {
      hashscanUrl = `https://hashscan.io/${hedera.config.network}/transaction`;
    }

    for (const [type, transactions] of this.data.entries()) {
      for (const transaction of transactions) {
        rows.push([
          type,
          transaction.fee.toBigNumber().toNumber().toString(),
          transaction.transactionId,
          `${hashscanUrl}/${transaction.transactionId}`,
        ]);
      }
    }
    const csv = json2csv([headers, ...rows], { prependHeader: false });
    await fs.writeFile(path.join(folderPath, `detailed-raport.csv`), csv, { encoding: 'utf-8' });
  }

  async saveRaport(folderPath: string) {
    const price = await coingekoApi.getHbarPriceInUsd();
    const headers = [
      'Type',
      'Average fee',
      'Total fee',
      'Average Fee in USD',
      'Total fee in USD',
      'Number of transactions',
    ];
    const rows: string[][] = [];

    for (const [type, transactions] of this.data.entries()) {
      const totalFee = transactions.reduce((acc, curr) => {
        const { fee } = curr;
        return acc + fee.toBigNumber().toNumber();
      }, 0);

      const avgFee = totalFee / transactions.length;
      const hbarPrice = price['hedera-hashgraph'].usd;

      rows.push([
        type,
        `${totalFee / transactions.length}`,
        totalFee.toString(),
        (avgFee * hbarPrice).toString(),
        (totalFee * hbarPrice).toString(),
        transactions.length.toString(),
      ]);
    }
    const csv = json2csv([headers, ...rows], { prependHeader: false });
    await fs.writeFile(path.join(folderPath, `raport.csv`), csv, { encoding: 'utf-8' });
  }

  async storeDataWrapper(method: () => Promise<AssumptionObject>) {
    const { type, ...data } = await method.call(this);
    const cachedItem = this.data.get(type) ?? [];
    this.data.set(type, [...cachedItem, data]);
  }

  async associateToken(): Promise<AssumptionObject> {
    const { wallet } = await HederaWallet.create(this.hedera);
    return wallet.associateToken(this.token);
  }

  async fileAppend(): Promise<AssumptionObject> {
    return this.file.append();
  }

  async allowanceApproveTransaction(): Promise<AssumptionObject> {
    const transaction = new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(this.hedera.operatorId, this.receiver.accountId, Hbar.from(100, HbarUnit.Tinybar))
      .freezeWith(this.hedera.client);
    const signTx = await transaction.sign(this.hedera.operatorKey);
    const txResponse = await signTx.execute(this.hedera.client);
    const record = await txResponse.getRecord(this.hedera.client);
    return {
      fee: record.transactionFee,
      transactionId: txResponse.transactionId.toString(),
      type: 'CRYPTO_APPROVE_ALLOWANCE',
    };
  }

  // TODO: not working
  async ethereumTransaction(): Promise<AssumptionObject> {
    return this.ethers.createRawTransaction(this.receiver);
  }

  async contractCall(): Promise<AssumptionObject> {
    const transaction = new ContractExecuteTransaction()
      .setGas(100000)
      .setContractId(this.contract.contractId)
      .setFunction('set_message', new ContractFunctionParameters().addString('Hello from Hedera again!'));
    const submitExecTx = await transaction.execute(this.hedera.client);
    const record = await submitExecTx.getRecord(this.hedera.client);
    return { fee: record.transactionFee, transactionId: submitExecTx.transactionId.toString(), type: 'CONTRACT_CALL' };
  }

  async topicMessageSubmit(): Promise<AssumptionObject> {
    return this.topic.submitMessage();
  }

  async transferHBar(): Promise<AssumptionObject> {
    let transaction = new TransferTransaction()
      .addHbarTransfer(this.hedera.operatorId, new Hbar(-1, HbarUnit.Tinybar))
      .addHbarTransfer(this.receiver.accountId, new Hbar(1, HbarUnit.Tinybar));
    transaction = transaction.freezeWith(this.hedera.client);
    const signedTx = await transaction.sign(this.hedera.operatorKey);
    const txResponse = await signedTx.execute(this.hedera.client);
    const record = await txResponse.getRecord(this.hedera.client);
    return { fee: record.transactionFee, transactionId: txResponse.transactionId.toString(), type: 'CRYPTO_TRANSFER' };
  }

  async createWallet(): Promise<AssumptionObject> {
    const { details } = await HederaWallet.create(this.hedera);
    return details;
  }

  async tokenBurn(): Promise<AssumptionObject> {
    const { nft } = await this.token.mint();
    return nft.burn();
  }

  async tokenMint(): Promise<AssumptionObject> {
    const { details } = await this.token.mint();
    return details;
  }
}
