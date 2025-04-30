import { Config } from './modules/config';
import { Hedera } from './modules/hedera';
import fsSync from 'fs';
import fs from 'fs/promises';
import { chunk } from 'remeda';
import { AssumptionObject, Methods } from './methods';
import { config as configDotenv } from 'dotenv';
import path from 'path';
import { sleep } from './utils/sleep';
import { format } from 'date-fns';
import os from 'os';
import { CronJob } from 'cron';
import { validateCronExpression } from 'cron';
import { invariant } from './utils/invariant';
import { logger } from './utils/logger';
import { getArg } from './utils/get-arg';
import { z } from 'zod';

configDotenv();

const cronPattern = getArg({
  argName: 'scheduler',
  validate: (value) => {
    if (!value) return;
    const isValidExpression = validateCronExpression(value);
    invariant(isValidExpression.valid, 'Cron scheduler is invalid');
    return value;
  },
});

const quantity = getArg({
  argName: 'quantity',
  validate: (value) => {
    return z.preprocess((v) => Number(v), z.number()).parse(value);
  },
});

const network = getArg({
  argName: 'network',
  validate: (value) => {
    return z.enum(['mainnet', 'testnet', 'localnet']).parse(value);
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
const allActions: (typeof actions)[number][] = actions.flatMap((action) => new Array(quantity).fill(action));

const chunkedActions = chunk(allActions, Math.ceil(allActions.length / 3));

const mappedMethods: Record<(typeof actions)[number], () => Promise<AssumptionObject>> = {
  'Approve allowance': methods.allowanceApproveTransaction,
  'Burn token': methods.tokenBurn,
  'Call contract': methods.contractCall,
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

const mainMethod = async () => {
  let actionCount = 0;
  await Promise.all(
    chunkedActions.map((actions) => {
      return new Promise(async (resolve) => {
        for (const action of actions) {
          logger.info(`${action} is called. ${++actionCount} / ${allActions.length}`);

          try {
            await methods.storeDataWrapper(mappedMethods[action]);
          } catch (e) {
            logger.error(`Failed action ${action}, waiting 2.5s before start again`);
            if (e instanceof Error) {
              logger.error(e.message);
            }
            failedRequests.push(action);
            await sleep(2500);
          }
        }
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
    let failedActionCount = 0;
    const requests = [...failedRequests];
    failedRequests = [];
    for (const failedAction of requests) {
      logger.info(`${failedAction} is called. ${++failedActionCount} / ${requests.length}. Attempt ${retries}`);
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
  }

  if (!fsSync.existsSync('reports')) {
    await fs.mkdir('reports', { recursive: true });
  }

  const time = new Date();
  const reportsPath = path.join('reports', format(time, 'ddMMyyyy-HHmm'));
  await fs.mkdir(reportsPath);

  console.log('\n\n');
  logger.info('Saving report');
  await Promise.all([methods.saveReport(reportsPath), methods.saveDetailsReport(hedera, reportsPath)]);
  console.log(`file://${path.join(os.homedir(), reportsPath)}`);
};

try {
  if (cronPattern) {
    const job = CronJob.from({
      cronTime: cronPattern,
      onTick: mainMethod,
      start: true,
    });
    if (typeof stopAfter === 'number' && stopAfter > 0) {
      console.log(stopAfter / 1000);
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
