import inquirer from 'inquirer';
import { Hedera } from './modules/hedera';
import { HederaToken } from './modules/hedera-token';
import { HederaWallet } from './modules/hedera-wallet';
import {
  AccountAllowanceApproveTransaction,
  AccountId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  EthereumTransaction,
  Hbar,
  HbarUnit,
  TopicMessageSubmitTransaction,
  TransferTransaction,
} from '@hashgraph/sdk';
import { HederaTopic } from './modules/hedera-topic';
import { HederaContract } from './modules/hedera-contract';
import { randomString } from 'remeda';
import { HederaFile } from './modules/hedera-file';

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
  fee: Hbar;
}

export class Methods {
  private receiver: HederaWallet;
  private topic: HederaTopic;
  private token: HederaToken;
  private hedera;
  private contract: HederaContract;

  private constructor(
    hedera: Hedera,
    topic: HederaTopic,
    contract: HederaContract,
    receiver: HederaWallet,
    token: HederaToken
  ) {
    this.hedera = hedera;
    this.receiver = receiver;
    this.topic = topic;
    this.contract = contract;
    this.token = token;
  }

  static async create(hedera: Hedera) {
    const receiver = await HederaWallet.create(hedera);
    const topic = await HederaTopic.create(hedera);
    const contract = await HederaContract.create(hedera);
    const token = await HederaToken.create(hedera);

    return new Methods(hedera, topic, contract, receiver, token);
  }

  async associateToken() {
    const wallet = await HederaWallet.create(this.hedera);
    await wallet.associateToken(this.token);
  }

  async fileAppend() {
    const file = await HederaFile.create(this.hedera);
    await file.append();
  }

  async allowanceApproveTransaction() {
    const transaction = new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(this.hedera.operatorId, this.receiver.accountId, Hbar.from(100, HbarUnit.Tinybar))
      .freezeWith(this.hedera.client);
    const signTx = await transaction.sign(this.hedera.operatorKey);
    const txResponse = await signTx.execute(this.hedera.client);
    const receipt = await txResponse.getReceipt(this.hedera.client);
    console.log(receipt.status.toString(), transaction.transactionId?.toString());
  }

  // TODO: not working
  async ethereumTransaction() {
    const file = await HederaFile.create(this.hedera);
    const tx = new EthereumTransaction().setCallDataFileId(file.fileId);
    const txResponse = await tx.execute(this.hedera.client);
    const receipt = await txResponse.getReceipt(this.hedera.client);
    console.log(txResponse.transactionId);
  }

  async contractCall() {
    if (!this.contract) {
      this.contract = await HederaContract.create(this.hedera);
    }
    console.log('Contract created');
    const transaction = new ContractExecuteTransaction()
      .setGas(100000)
      .setContractId(this.contract.contractId)
      .setFunction('set_message', new ContractFunctionParameters().addString('Hello from Hedera again!'));
    const submitExecTx = await transaction.execute(this.hedera.client);
    const receipt2 = await submitExecTx.getReceipt(this.hedera.client);
    console.log('The transaction status is ' + receipt2.status.toString());
  }

  async topicMessageSubmit() {
    if (!this.topic) {
      this.topic = await HederaTopic.create(this.hedera);
    }
    await this.topic.submitMessage();
  }

  async transferHBar() {
    if (!this.receiver) {
      this.receiver = await HederaWallet.create(this.hedera);
    }
    let transaction = new TransferTransaction()
      .addHbarTransfer(this.hedera.operatorId, new Hbar(-1, HbarUnit.Tinybar))
      .addHbarTransfer(this.receiver.accountId, new Hbar(1, HbarUnit.Tinybar));
    transaction = transaction.freezeWith(this.hedera.client);
    const signedTx = await transaction.sign(this.hedera.operatorKey);
    const txResponse = await signedTx.execute(this.hedera.client);
    const receipt = await txResponse.getReceipt(this.hedera.client);
    const transactionStatus = receipt.status;

    console.log('The transaction consensus status is ' + transactionStatus.toString());
  }

  async createWallet() {
    const wallet = await HederaWallet.create(this.hedera);
    return wallet;
  }

  async tokenBurn() {
    const token = await HederaToken.create(this.hedera);
    const nft = await token.mint();
    await nft.burn();
  }

  async tokenMint(quantity = 1) {
    const token = await HederaToken.create(this.hedera);
    for (const _ of new Array(quantity).fill(0)) {
      await token.mint();
    }
  }
}
