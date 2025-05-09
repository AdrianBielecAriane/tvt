import { Config } from './modules/config';
import { Hedera } from './modules/hedera';
import fsSync from 'fs';
import fs from 'fs/promises';
import { chunk } from 'remeda';
import { AssumptionObject, Methods } from './methods';
import { config as configDotenv } from 'dotenv';
import { sleep } from './utils/sleep';
import { format } from 'date-fns';
import { CronJob, sendAt } from 'cron';
import { validateCronExpression } from 'cron';
import { invariant } from './utils/invariant';
import { logger } from './utils/logger';
import { getArg } from './utils/get-arg';
import { z } from 'zod';

configDotenv();

const cronPattern = await getArg({
  argName: 'scheduler',
  validate: (value) => {
    if (!value || value === '') return;
    console.log(value, 'Cron scheduler');
    const isValidExpression = validateCronExpression(value);
    invariant(isValidExpression.valid, 'Cron scheduler is invalid');
    return value;
  },
});

const cronTimeout = await getArg({
  argName: 'scheduler-timeout',
  validate: (value) => {
    if (!value) return;
    return z.preprocess((v) => Number(v), z.number()).parse(value);
  },
});

const quantity = await getArg({
  argName: 'quantity',
  validate: (value) => {
    const isValid = z.preprocess((v) => Number(v), z.number()).safeParse(value);
    invariant(!isValid.error, 'Quantity is not valid number, pass --quantity in args');
    return isValid.data;
  },
});

const network = await getArg({
  argName: 'network',
  validate: (value) => {
    const isValid = z.enum(['mainnet', 'testnet', 'localnet']).safeParse(value);
    invariant(!isValid.error, 'Network is not valid enum, pass --network in args');
    return isValid.data;
  },
});
const timeSymbolSchema = z.union([z.literal('d'), z.literal('h'), z.literal('m'), z.literal('w')]);
type TimeSymbol = z.infer<typeof timeSymbolSchema>;

const multiplers = {
  m: 1000 * 60,
  h: 1000 * 60 * 60,
  d: 1000 * 60 * 60 * 24,
  w: 1000 * 60 * 60 * 24 * 7,
} satisfies Record<TimeSymbol, number>;

const stopAfter = getArg({
  argName: 'stop-after',
  validate: (value) => {
    if (!value) return;
    const symbolChar = value.at(-1);
    const { success, data } = timeSymbolSchema.safeParse(symbolChar);
    invariant(success, 'Invalid time symbol');
    const multipler = multiplers[data];
    const number = z.preprocess((v) => Number(v), z.number().positive()).parse(value.split(data)[0]);
    return multipler * number;
  },
});

const config = await Config.create(network);
const hedera = new Hedera(config);
const methods = await Methods.create(hedera);

export const actions = [
  'Approve allowance',
  'Eth transaction',
  'Transfer HBar',
  'Transfer token(NFT)',
  'Transfer token(FT)',
  'TOKEN ASSOCIATE',
  'FILE APPEND',
  'Call contract',
  'Mint token(NFT)',
  'Mint token(FT)',
  'Burn token',
  'Create account',
  'Submit message',
] as const;

console.clear();
const balance = await hedera.getCustodianBalance();
logger.info(`Your balance: ${balance}HBar`);

// Store actions to call
const allActions: (typeof actions)[number][] = actions
  .filter((action) => {
    if (config.config.operatorKeyType !== 'ED25519') {
      return true;
    }
    const isEthTransaction = action === 'Eth transaction';
    if (isEthTransaction) {
      logger.warn('Eth transactions are not supported in ED25519, omitting actions');
    }

    return !isEthTransaction;
  })
  .flatMap((action) => new Array(quantity).fill(action));

const chunkedActions = chunk(allActions, Math.ceil(allActions.length / 3));

const mappedMethods: Record<(typeof actions)[number], () => Promise<AssumptionObject | AssumptionObject[]>> = {
  'Approve allowance': methods.allowanceApproveTransaction,
  'Transfer token(NFT)': methods.transferTokenNft,
  'Transfer token(FT)': methods.transferTokenFt,
  'Burn token': methods.tokenBurn,
  'Call contract': methods.contractCallTwice,
  'Create account': methods.createWallet,
  'Mint token(NFT)': () => methods.tokenMint('NFT'),
  'Mint token(FT)': () => methods.tokenMint('FT'),
  'Submit message': methods.topicMessageSubmit,
  'Transfer HBar': methods.transferHBar,
  'FILE APPEND': methods.fileAppend,
  'TOKEN ASSOCIATE': methods.associateToken,
  'Eth transaction': methods.ethereumTransaction,
};

let failedRequests: (typeof actions)[number][] = [];

interface FireActions {
  requests: (typeof actions)[number][];
  isRetry?: boolean;
  numberOfActions: number;
}

let retries = 0;
let failedActionCount = 0;
const fireActions = async ({ numberOfActions, requests, isRetry }: FireActions) => {
  retries = 0;
  let failedRequests: (typeof actions)[number][] = [];
  for (const failedAction of requests) {
    logger.info(
      `${failedAction} is called. ${++failedActionCount} / ${numberOfActions}.${
        isRetry ? `Attempt ${retries++ + 1}` : ''
      }`
    );
    try {
      await methods.storeDataWrapper(mappedMethods[failedAction]);
    } catch (e) {
      logger.error(`Failed action ${failedAction}, waiting 2.5s before start again`);
      if (e instanceof Error) {
        logger.error(e.message);
      }
      failedRequests.push(failedAction);
      await sleep(2500);
    }
  }
  return failedRequests;
};

let isAnyRuns = false;
const mainMethod = async () => {
  if (isAnyRuns) {
    logger.warn('Another cron is already running, cannot start the cron');
    return;
  }
  isAnyRuns = true;
  failedRequests = [];
  await Promise.all(
    chunkedActions.map((actions) => {
      return new Promise(async (resolve) => {
        const actionsResults = await fireActions({ requests: actions, numberOfActions: allActions.length });
        failedRequests.push(...actionsResults);
        resolve(true);
      });
    })
  );

  if (failedRequests.length > 0) {
    await methods.ethers.refetchNonce();
    logger.warn(`Start to refetching failed transactions`);
  }

  let retries = 0;
  while (retries++ < 3) {
    failedActionCount = 0;
    const requests = [...failedRequests];
    failedRequests = await fireActions({ requests, isRetry: true, numberOfActions: requests.length });
  }

  const time = new Date();
  const reportsPath = `reports_${format(time, 'yyyy-MM-dd_hh-mm-ss')}`;
  await fs.mkdir(reportsPath);

  console.log('\n\n');
  logger.info('Saving report');
  await Promise.all([methods.saveReport(reportsPath), methods.saveDetailsReport(hedera, reportsPath)]);
  console.log(`file://${reportsPath}`);
  isAnyRuns = false;
};

try {
  if (cronPattern || cronTimeout) {
    const currentMinute = new Date().getMinutes();
    const validPattern =
      typeof cronPattern === 'string' ? cronPattern : `0 ${currentMinute + 1} */${cronTimeout} * * *`;
    const job = CronJob.from({
      cronTime: validPattern,
      onTick: mainMethod,
      start: true,
    });
    logger.info(`Cron will run first time at: ${sendAt(validPattern).toString()}`);
    if (typeof stopAfter === 'number' && stopAfter > 0) {
      setTimeout(async () => {
        logger.info('Stopping cron');
        await job.stop();
        process.exit();
      }, stopAfter);
    }
  } else {
    await mainMethod();
    process.exit();
  }
} catch (e) {
  console.log(e);
  await mainMethod();
  process.exit();
}
