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
import { getEnv } from './config';

export class HederaTopic {
  topicId: TopicId;
  hedera: Hedera;

  private constructor(topicId: TopicId, hedera: Hedera) {
    this.topicId = topicId;
    this.hedera = hedera;
  }

  static async create(hedera: Hedera) {
    const transaction = new TopicCreateTransaction()
      .setFeeScheduleKey(hedera.operatorKey)
      .setAdminKey(hedera.operatorKey);
    const txResponse = await transaction.execute(hedera.client);
    const receipt = await txResponse.getReceipt(hedera.client);

    const topicId = receipt.topicId;
    invariant(topicId, 'Topic id not found');
    return new HederaTopic(topicId, hedera);
  }

  static async init(hedera: Hedera) {
    const prefix = hedera.getPrefix();
    const topicId = getEnv({ prefix, key: 'TOPIC_ID' });
    if (topicId) {
      return new HederaTopic(TopicId.fromString(topicId), hedera);
    }
    return HederaTopic.create(hedera);
  }

  async submitMessage(): Promise<AssumptionObject> {
    const transaction = new TopicMessageSubmitTransaction().setTopicId(this.topicId).setMessage(R.randomString(10));
    const res = await transaction.execute(this.hedera.client);
    await res.getReceipt(this.hedera.client);
    const record = await res.getRecord(this.hedera.client);
    return {
      type: 'CONSENSUS_SUBMIT_MESSAGE',
      fee: record.transactionFee,
      transactionId: res.transactionId.toString(),
    };
  }
}
