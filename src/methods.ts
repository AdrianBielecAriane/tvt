import { Hedera } from './modules/hedera';
import { HederaNftClass, HederaToken } from './modules/hedera-token';
import { HederaWallet } from './modules/hedera-wallet';
import {
  AccountAllowanceApproveTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
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
import { getEnvsFile } from './modules/config';
import { Ethers } from './modules/ethers';
import { coingekoApi } from './modules/coingeko';
import { scheduledFees } from './utils/scheduled-fees.data';
import { invariant } from './utils/invariant';
import { quantile, standardDeviation, median } from 'simple-statistics';

const transactionTypes = [
  'CRYPTO_TRANSFER',
  'CONTRACT_CALL',
  'CONSENSUS_SUBMIT_MESSAGE',
  'TOKEN_MINT(NFT)',
  'TOKEN_MINT(FT)',
  'ETHEREUM_TRANSACTION',
  'CRYPTO_APPROVE_ALLOWANCE',
  'TOKEN_BURN',
  'CRYPTO_CREATE_ACCOUNT',
  'TOKEN_ASSOCIATE',
  'FILE_APPEND',
] as const;
export type TransactionType = (typeof transactionTypes)[number];

export interface AssumptionObject {
  type: TransactionType;
  transactionId: string;
  fee: Hbar;
  gasUsed?: Long | undefined;
  gasFee?: Long | undefined;
}

export class Methods {
  private data = new Map<
    TransactionType,
    {
      transactionId: string;
      fee: Hbar;
      gasUsed?: Long | undefined;
      gasFee?: Long | undefined;
    }[]
  >();
  ethers;
  private receiver: HederaWallet;
  private topic: HederaTopic;
  private nonFungibleToken: HederaToken;
  private fungibleToken: HederaToken;
  private hedera;
  private contract: HederaContract;
  private file: HederaFile;
  private nft: HederaNftClass;

  private constructor(
    hedera: Hedera,
    topic: HederaTopic,
    contract: HederaContract,
    receiver: HederaWallet,
    nonFungibleToken: HederaToken,
    fungibleToken: HederaToken,
    nft: HederaNftClass,
    file: HederaFile,
    ethers: Ethers
  ) {
    this.hedera = hedera;
    this.receiver = receiver;
    this.topic = topic;
    this.contract = contract;
    this.nonFungibleToken = nonFungibleToken;
    this.fungibleToken = fungibleToken;
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
    const { fungibleToken, nonFungibleToken, nft } = await HederaToken.init(hedera);
    invariant(nft, 'NFT not exist');
    const file = await HederaFile.init(hedera);
    const ethers = await Ethers.create(hedera);

    const config = {
      [`${prefix}_WALLET_ID`]: receiver.accountId.toString(),
      [`${prefix}_TOPIC_ID`]: topic.topicId.toString(),
      [`${prefix}_CONTRACT_ID`]: contract.contractId.toStringWithChecksum(hedera.client),
      [`${prefix}_CONTRACT_FILE_ID`]: contract.file.fileId.toString(),
      [`${prefix}_TOKEN_ID`]: nonFungibleToken.tokenId.toString(),
      [`${prefix}_FILE_ID`]: file.fileId.toString(),
      [`${prefix}_FUNGIBLE_TOKEN_ID`]: fungibleToken.tokenId.toString(),
    };
    const envs = await getEnvsFile();
    await fs.writeFile('config.json', JSON.stringify({ ...envs, ...config }), {
      encoding: 'utf-8',
    });
    return new Methods(hedera, topic, contract, receiver, nonFungibleToken, fungibleToken, nft, file, ethers);
  }

  async saveDetailsReport(hedera: Hedera, folderPath: string) {
    const headers = [
      'Id',
      'Type',
      'Fee(HBar)',
      'Gas used',
      'Gas consumed',
      'Gas Price',
      'Total Gas Fee',
      'Hashscan link',
    ];
    const rows: string[][] = [];

    let hashscanUrl;
    if (hedera.config.network === 'localnet') {
      hashscanUrl = `http://${hedera.config.networkIp}:8080/devnet/transaction`;
    } else {
      hashscanUrl = `https://hashscan.io/${hedera.config.network}/transaction`;
    }

    for (const [type, transactions] of this.data.entries()) {
      for (const transaction of transactions) {
        let gasPrice;
        let gasConsumed;
        // Get gas price here, if we'd request it immediatly after creating transaction we may receive an error
        if (type === 'CONTRACT_CALL' || type === 'ETHEREUM_TRANSACTION') {
          const rightPartOfTransaction = transaction.transactionId.split('@')[1]?.replaceAll('.', '-');
          const query = await this.hedera.getContractResult({
            transactionId: `${transaction.transactionId.split('@')[0]}-${rightPartOfTransaction}`,
          });
          gasConsumed = new Hbar(query.gas_consumed, HbarUnit.Tinybar);

          const gasFees = await this.hedera.getGasPrice({ transactionId: transaction.transactionId });
          gasPrice = gasFees.fees.find((fee) =>
            type === 'CONTRACT_CALL'
              ? fee.transaction_type === 'ContractCall'
              : fee.transaction_type === 'EthereumTransaction'
          )?.gas;
        }

        const totalGasFee = gasPrice && gasConsumed ? Number(gasConsumed._valueInTinybar.toString()) * gasPrice : 0;
        rows.push([
          transaction.transactionId.split('@')[1] ?? '',
          type,
          transaction.fee.toBigNumber().toNumber().toString(),
          transaction.gasUsed?.toString() ?? '-',
          gasConsumed?.toString() ?? '-',
          gasPrice ? Hbar.fromTinybars(gasPrice).toString() : '-',
          Hbar.fromTinybars(totalGasFee).toString(),
          `${hashscanUrl}/${transaction.transactionId}`,
        ]);
      }
    }
    const csv = json2csv([headers, ...rows], { prependHeader: false });
    await fs.writeFile(path.join(folderPath, `detailed-report.csv`), csv, { encoding: 'utf-8' });
  }

  async saveReport(folderPath: string) {
    const price = await coingekoApi.getHbarPriceInUsd();
    const headers = [
      'Transaction',
      'Count',
      'Total fee (USD)',
      'Schedule fee (USD)',
      'Schedule fee difference(USD)',
      'Average Fee (USD)',
      'St.Dev',
      'Max',
      'Perc 25',
      'Median',
      'Perc 75',
      'Actl Closer to',
    ];

    const rows: string[][] = [];
    for (const [type, transactions] of this.data.entries()) {
      const totalFee = transactions.reduce((acc, curr) => {
        const { fee } = curr;
        return acc + fee.toBigNumber().toNumber();
      }, 0);

      const avgFee = totalFee / transactions.length;
      const hbarPrice = price['hedera-hashgraph'].usd;
      const baseScheduleFee = scheduledFees[type];
      const avgFeeInUsd = avgFee * hbarPrice;
      const feesArray = transactions
        .map((transaction) => transaction.fee.toBigNumber().toNumber())
        .sort((a, b) => a - b);
      const max = Math.max(...feesArray);
      const perc25 = quantile(feesArray, 0.25);
      const perc75 = quantile(feesArray, 0.75);
      const mediana = median(feesArray);

      const actlList = [
        { type: 'Max', value: Math.abs(baseScheduleFee - max) },
        { type: '25th Percentile', value: Math.abs(baseScheduleFee - perc25) },
        { type: '75th Percentile', value: Math.abs(baseScheduleFee - perc75) },
        { type: 'Mean', value: Math.abs(baseScheduleFee - avgFee) },
        { type: 'Median', value: Math.abs(baseScheduleFee - mediana) },
      ] as const;
      actlList.toSorted((a, b) => a.value - b.value);
      const [actl] = actlList;
      const allClosestValues = actlList.filter((v) => v.value === actl.value).map((v) => v.type);

      rows.push([
        type,
        transactions.length.toString(),
        (totalFee * hbarPrice).toString(),
        baseScheduleFee.toString(),
        (scheduledFees[type] - avgFeeInUsd).toFixed(4),
        avgFeeInUsd.toString(),
        standardDeviation(feesArray).toString(),
        max.toString(),
        perc25.toString(),
        mediana.toString(),
        perc75.toString(),
        allClosestValues.join(','),
      ]);
    }
    const csv = json2csv([headers, ...rows], { prependHeader: false });
    await fs.writeFile(path.join(folderPath, `report.csv`), csv, { encoding: 'utf-8' });
  }

  async storeDataWrapper(method: () => Promise<AssumptionObject>) {
    const { type, ...data } = await method.call(this);
    const cachedItem = this.data.get(type) ?? [];
    this.data.set(type, [...cachedItem, data]);
  }

  async associateToken(): Promise<AssumptionObject> {
    const { wallet } = await HederaWallet.create(this.hedera);
    return wallet.associateToken(this.fungibleToken);
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
    await submitExecTx.getReceipt(this.hedera.client);

    return {
      fee: record.transactionFee,
      gasUsed: record.contractFunctionResult?.gasUsed,
      gasFee: record.contractFunctionResult?.gas,
      transactionId: submitExecTx.transactionId.toString(),
      type: 'CONTRACT_CALL',
    };
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
    const { nft } = await this.nonFungibleToken.mint();
    invariant(nft, 'Failed to create nft');
    return nft.burn();
  }

  async tokenMint(type: 'NFT' | 'FT'): Promise<AssumptionObject> {
    const tokenToMint = type === 'NFT' ? this.fungibleToken : this.nonFungibleToken;
    const { details } = await tokenToMint.mint();
    return details;
  }
}
