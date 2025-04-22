import { TransactionType } from '../methods';

export const scheduledFees = {
  CRYPTO_TRANSFER: 0.0001,
  CONTRACT_CALL: 0.0085,
  CONSENSUS_SUBMIT_MESSAGE: 0.0001,
  TOKEN_MINT: 0.001,
  ETHEREUM_TRANSACTION: 0.0001,
  CRYPTO_APPROVE_ALLOWANCE: 0.05,
  TOKEN_BURN: 0.001,
  CRYPTO_CREATE_ACCOUNT: 0.05,
  TOKEN_ASSOCIATE: 0.05,
  FILE_APPEND: 0.05,
} as const satisfies Record<TransactionType, number>;
