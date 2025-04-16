import { FileAppendTransaction, FileCreateTransaction, FileId, Hbar, PrivateKey } from '@hashgraph/sdk';
import helloHedera from './contract/HelloHedera.json';
import { invariant } from '../utils/invariant';
import { Hedera } from './hedera';
import { randomString } from 'remeda';
import { AssumptionObject } from '../methods';

export class HederaFile {
  fileId;
  hedera;
  createFee: Hbar;
  private constructor(fileId: FileId, hedera: Hedera, createFee: Hbar) {
    this.fileId = fileId;
    this.hedera = hedera;
    this.createFee = createFee;
  }

  static async create(hedera: Hedera) {
    const transaction = new FileCreateTransaction()
      .setContents(helloHedera.data.bytecode.object)
      .setKeys([hedera.operatorKey.publicKey]);
    const submitTx = await transaction.execute(hedera.client);
    const receipt = await submitTx.getReceipt(hedera.client);
    const fileId = receipt.fileId;
    invariant(fileId, 'File id not found');
    const record = await submitTx.getRecord(hedera.client);

    return new HederaFile(fileId, hedera, record.transactionFee);
  }

  async append(): Promise<AssumptionObject> {
    const transaction = new FileAppendTransaction()
      .setFileId(this.fileId)
      .setContents(randomString(6))
      .freezeWith(this.hedera.client);
    const signTx = await transaction.sign(this.hedera.operatorKey);
    const txResponse = await signTx.execute(this.hedera.client);
    await txResponse.getReceipt(this.hedera.client);
    const record = await txResponse.getRecord(this.hedera.client);
    return { type: 'FILE_APPEND', fee: record.transactionFee };
  }
}
