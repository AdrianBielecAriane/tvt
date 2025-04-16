import {
  Hbar,
  TopicCreateTransaction,
  TopicDeleteTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import * as R from 'remeda';
import { Hedera } from './hedera';
import { invariant } from '../utils/invariant';
import { AssumptionObject } from '../methods';

export class HederaTopic {
  topicId: TopicId;
  hedera: Hedera;
  createFee: Hbar;

  private constructor(topicId: TopicId, hedera: Hedera, createFee: Hbar) {
    this.topicId = topicId;
    this.hedera = hedera;
    this.createFee = createFee;
  }

  static async create(hedera: Hedera) {
    const transaction = new TopicCreateTransaction().setAdminKey(hedera.operatorKey);
    const txResponse = await transaction.execute(hedera.client);
    const receipt = await txResponse.getReceipt(hedera.client);
    const record = await txResponse.getRecord(hedera.client);

    const topicId = receipt.topicId;
    invariant(topicId, 'Topic id not found');
    console.log({
      topicId: topicId.toString(),
      transactionStatus: receipt.status.toString(),
    });
    return new HederaTopic(topicId, hedera, record.transactionFee);
  }

  async submitMessage(): Promise<AssumptionObject> {
    const transaction = new TopicMessageSubmitTransaction().setTopicId(this.topicId).setMessage(R.randomString(10));
    const res = await transaction.execute(this.hedera.client);
    await res.getReceipt(this.hedera.client);
    const record = await res.getRecord(this.hedera.client);
    return { type: 'CONSENSUS_SUBMIT_MESSAGE', fee: record.transactionFee };
  }
}
