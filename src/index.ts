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
for (const chunk of chunkedActions) {
  await Promise.all(
    chunk.map((action) => {
      return new Promise(async (resolve) => {
        console.log(`action: ${++actionCount} is called`);
        await methods.storeDataWrapper(mappedMethods[action]);
        resolve(true);
      });
    })
  );
}

if (!fsSync.existsSync('raports')) {
  await fs.mkdir('raports', { recursive: true });
}

const time = new Date().getTime();
const raportsPath = path.join('raports', time.toString());
await fs.mkdir(raportsPath);

await Promise.all([methods.saveRaport(raportsPath), methods.saveDetailsRaport(hedera, raportsPath)]);
process.exit();
