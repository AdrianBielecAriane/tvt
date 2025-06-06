import { Hedera } from './modules/hedera';
import { HederaNftClass, HederaToken } from './modules/hedera-token';
import { HederaWallet } from './modules/hedera-wallet';
import {
  AccountAllowanceApproveTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Hbar,
  HbarUnit,
  NftId,
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
import { sleep } from './utils/sleep';

const transactionTypes = [
  'CRYPTO_TRANSFER(HBar)',
  'CRYPTO_TRANSFER(NFT)',
  'CRYPTO_TRANSFER(FT)',
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

const isEVMTransaction = (type: string) => ['CONTRACT_CALL', 'ETHEREUM_TRANSACTION'].includes(type);

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
    const topic = await HederaTopic.init(hedera);
    // Prefetch, verify whether credentials are valid
    try {
      await topic.submitMessage();
    } catch (e) {
      if (e instanceof Error) {
        console.log(e.message);
      }
    }

    const contract = await HederaContract.init(hedera);
    const { fungibleToken, nonFungibleToken, nft } = await HederaToken.init(hedera);
    invariant(nft, 'NFT not exist');
    const file = await HederaFile.init(hedera);
    const ethers = await Ethers.create(hedera);
    const receiver = await HederaWallet.init(hedera, nonFungibleToken, fungibleToken);

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
    await fs.writeFile(path.join('work', 'config.json'), JSON.stringify({ ...envs, ...config }), {
      encoding: 'utf-8',
    });
    return new Methods(hedera, topic, contract, receiver, nonFungibleToken, fungibleToken, nft, file, ethers);
  }

  async saveDetailsReport(hedera: Hedera, folderPath: string) {
    const headers = ['Id', 'Type', 'Fee(HBar)', 'Gas used', 'Comment', 'Total Gas Fee', 'Hashscan link'];
    const rows: string[][] = [];

    let hashscanUrl;
    if (hedera.config.network === 'localnet') {
      hashscanUrl = `http://${hedera.config.networkIp}:8080/devnet/transaction`;
    } else {
      hashscanUrl = `https://hashscan.io/${hedera.config.network}/transaction`;
    }

    for (const [type, transactions] of this.data.entries()) {
      let comment = '-';
      for (const transaction of transactions) {
        let gasPrice;
        let gasConsumed;
        let gasUsed;
        // Get gas price here, if we'd request it immediatly after creating transaction we may receive an error
        if (isEVMTransaction(type)) {
          const rightPartOfTransaction = transaction.transactionId.split('@')[1]?.replaceAll('.', '-');
          const query = await this.hedera.getContractResult({
            transactionId: `${transaction.transactionId.split('@')[0]}-${rightPartOfTransaction}`,
          });
          gasConsumed = new Hbar(query.gas_consumed, HbarUnit.Tinybar);
          gasUsed = new Hbar(query.gas_used, HbarUnit.Tinybar);

          const gasFees = await this.hedera.getGasPrice({ transactionId: transaction.transactionId });
          gasPrice = gasFees.fees.find((fee) =>
            type === 'CONTRACT_CALL'
              ? fee.transaction_type === 'ContractCall'
              : fee.transaction_type === 'EthereumTransaction'
          )?.gas;

          if (gasConsumed._valueInTinybar.toNumber() === gasUsed._valueInTinybar.toNumber()) {
            comment = 'The transaction was executed with the exact amount of gas needed.';
          } else if (gasConsumed._valueInTinybar.toNumber() < gasUsed._valueInTinybar.toNumber()) {
            comment = 'The transaction was executed with more gas than needed. Hedera returns only 20% of the gas set.';
          }
        }

        const totalGasFee = gasPrice && gasConsumed ? Number(gasConsumed._valueInTinybar.toString()) * gasPrice : 0;
        rows.push([
          transaction.transactionId.split('@')[1] ?? '',
          type,
          transaction.fee.toBigNumber().toNumber().toString(),
          transaction.gasUsed ? Hbar.fromTinybars(transaction.gasUsed).toString() : '-',
          comment,
          `${isEVMTransaction(type) ? '(B)' : ''}${Hbar.fromTinybars(totalGasFee).toString()}`,
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
      'AVG Gas price (USD)',
      'AVG Gas consumed (USD)',
      'Schedule fee (USD)',
      'Schedule fee difference(USD)',
      'Schedule fee difference (%)',
      'Average Fee (USD)',
      'St.Dev',
      'Max(USD)',
      'Perc 25(USD)',
      'Median(USD)',
      'Perc 75(USD)',
      'Actl Closer to',
    ];

    const rows: string[][] = [];
    for (const [type, transactions] of this.data.entries()) {
      const totalFee = transactions.reduce((acc, curr) => {
        const { fee } = curr;
        return acc + fee.toBigNumber().toNumber();
      }, 0);

      let totalEstimatedGasFee = 0;
      let totalGasPrice = 0;
      let totalGasConsumed = 0;
      if (isEVMTransaction(type)) {
        for (const transaction of transactions) {
          const rightPartOfTransaction = transaction.transactionId.split('@')[1]?.replaceAll('.', '-');
          const query = await this.hedera.getContractResult({
            transactionId: `${transaction.transactionId.split('@')[0]}-${rightPartOfTransaction}`,
          });
          const gasConsumed = new Hbar(query.gas_consumed, HbarUnit.Tinybar)._valueInTinybar.toNumber();

          const gasFees = await this.hedera.getGasPrice({ transactionId: transaction.transactionId });
          const gasPrice =
            gasFees.fees.find((fee) =>
              type === 'CONTRACT_CALL'
                ? fee.transaction_type === 'ContractCall'
                : fee.transaction_type === 'EthereumTransaction'
            )?.gas ?? 0;
          totalGasPrice += gasPrice;
          totalGasConsumed += gasConsumed;
          totalEstimatedGasFee += Hbar.fromTinybars(gasPrice)._valueInTinybar.toNumber() * gasConsumed;
        }
      }

      const hbarPrice = price['hedera-hashgraph'].usd;
      const avgGasConsumedUSD =
        Hbar.fromTinybars(Math.round(totalGasConsumed / transactions.length))
          .toBigNumber()
          .toNumber() * hbarPrice;
      const avgGasPriceUSD =
        Hbar.fromTinybars(Math.round(totalGasPrice / transactions.length))
          .toBigNumber()
          .toNumber() * hbarPrice;

      const avgFee = totalFee / transactions.length;
      let baseScheduleFee = scheduledFees[type];
      if (isEVMTransaction(type)) {
        baseScheduleFee += avgGasConsumedUSD + avgGasPriceUSD;
      }

      const avgFeeInUsd = avgFee * hbarPrice;
      const feesArray = transactions
        .map((transaction) => transaction.fee.toBigNumber().toNumber())
        .sort((a, b) => a - b);
      const max = Math.max(...feesArray) * hbarPrice;
      const perc25 = quantile(feesArray, 0.25) * hbarPrice;
      const perc75 = quantile(feesArray, 0.75) * hbarPrice;
      const mediana = median(feesArray) * hbarPrice;

      const actlList = [
        { type: 'Max', value: Math.abs(baseScheduleFee - max * hbarPrice) },
        { type: '25th Percentile', value: Math.abs(baseScheduleFee - perc25 * hbarPrice) },
        { type: '75th Percentile', value: Math.abs(baseScheduleFee - perc75 * hbarPrice) },
        { type: 'Mean', value: Math.abs(baseScheduleFee - avgFee * hbarPrice) },
        { type: 'Median', value: Math.abs(baseScheduleFee - mediana * hbarPrice) },
      ] as const;
      actlList.toSorted((a, b) => a.value - b.value);
      const [actl] = actlList;
      const allClosestValues = actlList.filter((v) => v.value === actl.value).map((v) => v.type);
      let scheduleFeeDifference = baseScheduleFee - avgFeeInUsd;
      if (totalEstimatedGasFee > 0)
        scheduleFeeDifference +=
          Hbar.fromTinybars(totalEstimatedGasFee / transactions.length)
            .toBigNumber()
            .toNumber() * hbarPrice;

      rows.push([
        type,
        transactions.length.toString(),
        (totalFee * hbarPrice).toString(),
        avgGasPriceUSD.toString(),
        `${isEVMTransaction(type) ? '(B)' : ''}${avgGasConsumedUSD.toString()}`,
        baseScheduleFee.toString(),
        scheduleFeeDifference.toFixed(4),
        ((scheduleFeeDifference * 100) / baseScheduleFee).toFixed(2),
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

  async storeDataWrapper(method: () => Promise<AssumptionObject | AssumptionObject[]>) {
    const results = await method.call(this);
    const arrayResults = Array.isArray(results) ? results : [results];
    for (const result of arrayResults) {
      const { type, ...data } = result;
      const cachedItem = this.data.get(type) ?? [];
      this.data.set(type, [...cachedItem, data]);
    }
  }

  async associateToken(): Promise<AssumptionObject> {
    const { wallet } = await HederaWallet.create(this.hedera);
    return wallet.associateToken(this.fungibleToken);
  }

  async fileAppend(): Promise<AssumptionObject> {
    return this.file.append();
  }

  async transferTokenNft(): Promise<AssumptionObject> {
    const { nft } = await this.nonFungibleToken.mint();
    invariant(nft, 'Invalid nft');
    let transaction = new TransferTransaction()
      .addNftTransfer(
        new NftId(this.nonFungibleToken.tokenId, nft.serial),
        this.hedera.operatorId,
        this.receiver.accountId
      )
      .freezeWith(this.hedera.client);
    const txTransaction = await transaction.sign(this.hedera.operatorKey);
    const signedByReceiver = await txTransaction.sign(this.receiver.privateKey);
    const txResponse = await signedByReceiver.execute(this.hedera.client);
    const record = await txResponse.getRecord(this.hedera.client);
    return {
      fee: record.transactionFee,
      transactionId: txResponse.transactionId.toString(),
      type: 'CRYPTO_TRANSFER(NFT)',
    };
  }

  async transferTokenFt(): Promise<AssumptionObject> {
    await this.fungibleToken.mint();
    let transaction = new TransferTransaction()
      .addTokenTransfer(this.fungibleToken.tokenId, this.hedera.operatorId, -1)
      .addTokenTransfer(this.fungibleToken.tokenId, this.receiver.accountId, 1)
      .freezeWith(this.hedera.client);
    const txTransaction = await transaction.sign(this.hedera.operatorKey);
    const signedByReceiver = await txTransaction.sign(this.receiver.privateKey);
    const txResponse = await signedByReceiver.execute(this.hedera.client);
    const record = await txResponse.getRecord(this.hedera.client);
    return {
      fee: record.transactionFee,
      transactionId: txResponse.transactionId.toString(),
      type: 'CRYPTO_TRANSFER(FT)',
    };
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

  async ethereumTransaction(): Promise<AssumptionObject[]> {
    const firstTx = await this.ethers.createRawTransaction(this.receiver);
    const secondTx = await this.ethers.createRawTransaction(this.receiver, firstTx.transactionId);
    return [firstTx, secondTx];
  }

  async contractCallTwice(): Promise<AssumptionObject[]> {
    const firstTx = await this.contractCall();
    const secondTx = await this.contractCall(firstTx.transactionId);
    return [firstTx, secondTx];
  }

  async contractCall(prevContractId?: string): Promise<AssumptionObject> {
    let gas = 200_000;
    if (prevContractId) {
      const rightPartOfTransaction = prevContractId.split('@')[1]?.replaceAll('.', '-');
      const query = await this.hedera.getContractResult({
        transactionId: `${prevContractId.split('@')[0]}-${rightPartOfTransaction}`,
      });
      gas = query.gas_consumed;
    }

    const transaction1 = new ContractExecuteTransaction()
      .setGas(gas)
      .setContractId(this.contract.contractId)
      .setFunction('set_message', new ContractFunctionParameters().addString('Hello from Hedera again!'));
    const submitExecTx = await transaction1.execute(this.hedera.client);
    if (typeof prevContractId === 'undefined') {
      await sleep(5000);
    }

    await submitExecTx.getReceipt(this.hedera.client);
    const record = await submitExecTx.getRecord(this.hedera.client);

    return {
      fee: record.transactionFee,
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
    return {
      fee: record.transactionFee,
      transactionId: txResponse.transactionId.toString(),
      type: 'CRYPTO_TRANSFER(HBar)',
    };
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
    const tokenToMint = type === 'NFT' ? this.nonFungibleToken : this.fungibleToken;
    const { details } = await tokenToMint.mint();
    return details;
  }
}
