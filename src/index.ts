import { Config } from './modules/config';
import { Hedera } from './modules/hedera';
import inquirer from 'inquirer';
import fsSync from 'fs';
import fs from 'fs/promises';
import chalk from 'chalk';
import { chunk } from 'remeda';
import { AssumptionObject, Methods } from './methods';
import { config as configDotenv } from 'dotenv';
import path from 'path';
import { sleep } from './utils/sleep';

configDotenv();

const config = await Config.create();
const hedera = new Hedera(config);
const methods = await Methods.create(hedera);

export const actions = [
  'Approve allowance',
  'Eth transaction',
  'Transfer HBar',
  'TOKEN ASSOCIATE',
  'FILE APPEND',
  'Call contract',
  'Mint token',
  'Burn token',
  'Create account',
  'Submit message',
] as const;

console.clear();
const balance = await hedera.getCustodianBalance();
console.log(chalk.green(`Your balance: ${balance}HBar`));
const { selectedActions } = await inquirer.prompt<{ selectedActions: (typeof actions)[number][] }>([
  {
    type: 'checkbox',
    name: 'selectedActions',
    message: 'What action you want to do?',
    validate: (v) => v.length > 0,
    choices: actions,
  },
]);

const options = ['Same for all', 'Separatly'] as const;
const { option } = await inquirer.prompt<{ option: (typeof options)[number] }>([
  { type: 'select', message: 'How to set quantity', choices: options, name: 'option' },
]);

const quantities = new Map<(typeof actions)[number], number>();
console.log(option, option === 'Same for all');
if (option === 'Same for all') {
  const { quantity } = await inquirer.prompt<{ quantity: number }>([
    {
      type: 'number',
      name: 'quantity',
      message: `Input quantity`,
    },
  ]);
  for (const action of selectedActions) {
    quantities.set(action, quantity);
  }
} else {
  for (const action of selectedActions) {
    const { quantity } = await inquirer.prompt<{ quantity: number }>([
      {
        type: 'number',
        name: 'quantity',
        message: `Input quantity for "${action}"`,
      },
    ]);
    quantities.set(action, quantity);
  }
}

// Store actions to call
const allActions = Array.from(quantities).flatMap(([key, value]) => {
  return new Array<(typeof actions)[number]>(value).fill(key);
});

const chunkedActions = chunk(allActions, Math.ceil(allActions.length / 3));

const mappedMethods: Record<(typeof actions)[number], () => Promise<AssumptionObject>> = {
  'Approve allowance': methods.allowanceApproveTransaction,
  'Burn token': methods.tokenBurn,
  'Call contract': methods.contractCall,
  'Create account': methods.createWallet,
  'Mint token': methods.tokenMint,
  'Submit message': methods.topicMessageSubmit,
  'Transfer HBar': methods.transferHBar,
  'FILE APPEND': methods.fileAppend,
  'TOKEN ASSOCIATE': methods.associateToken,
  'Eth transaction': methods.ethereumTransaction,
};

let actionCount = 0;

const failedRequests: (typeof actions)[number][] = [];

await Promise.all(
  chunkedActions.map((actions) => {
    return new Promise(async (resolve) => {
      for (const action of actions) {
        console.log(chalk.green(`${action} is called. ${++actionCount} / ${allActions.length}`));

        try {
          await methods.storeDataWrapper(mappedMethods[action]);
        } catch (e) {
          console.log(chalk.red(`Failed action ${action}, waiting 2.5s before start again`));
          if (e instanceof Error) {
            console.log(chalk.red(e.message));
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
  console.log(chalk.yellow(`Start to refetching failed transactions`));
}

let failedActionCount = 0;
for (const failedAction of failedRequests) {
  console.log(chalk.green(`${failedAction} is called. ${++failedActionCount} / ${failedRequests.length}`));
  await methods.storeDataWrapper(mappedMethods[failedAction]);
}

if (!fsSync.existsSync('reports')) {
  await fs.mkdir('reports', { recursive: true });
}

const time = new Date().getTime();
const reportsPath = path.join('reports', time.toString());
await fs.mkdir(reportsPath);

console.log('\n\n');
console.log(chalk.green('Saving report'));
await Promise.all([methods.saveReport(reportsPath), methods.saveDetailsReport(hedera, reportsPath)]);
process.exit();
