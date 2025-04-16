import { Config } from './modules/config';
import { Hedera } from './modules/hedera';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { chunk } from 'remeda';
import { Methods } from './methods';

const config = await Config.create();
const hedera = new Hedera(config);
const methods = await Methods.create(hedera);

const actions = [
  'Approve allowance',
  'Eth transaction',
  'Transfer HBar',
  'TOKEN_ASSOCIATE',
  'FILE_APPEND',
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

for (const chunk of chunkedActions) {
  await Promise.all(
    chunk.map((action) => {
      return new Promise(async (resolve) => {
        switch (action) {
          case 'Burn token':
            await methods.tokenBurn();
            break;
          case 'Mint token':
            await methods.tokenMint();
            break;
          case 'Create account':
            await methods.createWallet();
            break;
          case 'Transfer HBar':
            await methods.transferHBar();
            break;
          case 'Submit message':
            await methods.topicMessageSubmit();
            break;
          case 'Call contract':
            await methods.contractCall();
            break;
          case 'Approve allowance':
            await methods.allowanceApproveTransaction();
            break;
          case 'TOKEN_ASSOCIATE':
            await methods.associateToken();
            break;
          case 'FILE_APPEND':
            await methods.fileAppend();
            break;
          // TODO: FIX
          case 'Eth transaction':
            await methods.ethereumTransaction();
            break;
        }
        resolve(true);
      });
    })
  );
}

process.exit();
