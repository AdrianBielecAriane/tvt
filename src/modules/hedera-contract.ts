import { ContractCreateTransaction, ContractFunctionParameters, ContractId, Hbar } from '@hashgraph/sdk';
import { HederaFile } from './hedera-file';
import { Hedera } from './hedera';
import { invariant } from '../utils/invariant';
import { getEnv } from './config';

export class HederaContract {
  contractId;
  file;
  hedera;
  createFee: Hbar | undefined;

  private constructor(contractId: ContractId, file: HederaFile, hedera: Hedera, createFee?: Hbar) {
    this.contractId = contractId;
    this.file = file;
    this.hedera = hedera;
    this.createFee = createFee;
  }

  static async init(hedera: Hedera) {
    const prefix = hedera.getPrefix();
    const file = await HederaFile.initSmartContractFile(hedera);
    const createdContractId = getEnv({ prefix, key: 'CONTRACT_ID' });

    if (createdContractId) {
      return new HederaContract(ContractId.fromString(createdContractId), file, hedera, undefined);
    }
    return HederaContract.create(hedera, true);
  }

  static async create(hedera: Hedera, omitFee?: boolean) {
    const file = await HederaFile.create(hedera);
    const contractCreate = new ContractCreateTransaction()
      .setGas(1000_000)
      .setBytecodeFileId(file.fileId)
      .setConstructorParameters(new ContractFunctionParameters().addString('Hello from Hedera!'));
    const txResponse = await contractCreate.execute(hedera.client);
    const record = await txResponse.getRecord(hedera.client);
    const receipt = await txResponse.getReceipt(hedera.client);
    const contractId = receipt.contractId;
    invariant(contractId, 'Contract id not found');
    return new HederaContract(contractId, file, hedera, omitFee ? undefined : record.transactionFee);
  }
}
