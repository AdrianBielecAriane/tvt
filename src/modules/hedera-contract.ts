import { ContractCreateTransaction, ContractFunctionParameters, ContractId, Hbar } from '@hashgraph/sdk';
import { HederaFile } from './hedera-file';
import { Hedera } from './hedera';
import { invariant } from '../utils/invariant';

export class HederaContract {
  contractId;
  file;
  hedera;
  createFee: Hbar;

  private constructor(contractId: ContractId, file: HederaFile, hedera: Hedera, createFee: Hbar) {
    this.contractId = contractId;
    this.file = file;
    this.hedera = hedera;
    this.createFee = createFee;
  }

  static async create(hedera: Hedera) {
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
    return new HederaContract(contractId, file, hedera, record.transactionFee);
  }
}
