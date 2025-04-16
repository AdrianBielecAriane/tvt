import { z } from 'zod';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs/promises';
import fsSync from 'fs';
import { CONFIG_FILE_PATH, CONFIG_PATH } from '../utils/load-env';
import { httpPing } from '../utils/http-ping';
import { ConfigPrefix } from './hedera';

const networkOptions = ['mainnet', 'testnet', 'localnet'] as const;
export type Network = (typeof networkOptions)[number];

type LocalConfig = {
  network: Exclude<Network, 'mainnet' | 'testnet'>;
  operatorId: string;
  networkIp: string;
  operatorKey: string;
};

type ExternalConfig = {
  network: Exclude<Network, 'localnet'>;
  operatorId: string;
  networkIp?: never;
  operatorKey: string;
};

const configSchema = z.object({
  TVT_LOCAL_OPERATOR_ID: z.string().optional(),
  TVT_LOCAL_OPERATOR_KEY: z.string().optional(),
  TVT_LOCAL_NETWORK_IP: z.string().optional(),
  TVT_LOCAL_TOPIC_ID: z.string().optional(),
  TVT_LOCAL_CONTRACT_FILE_ID: z.string(),
  TVT_LOCAL_CONTRACT_ID: z.string(),
  TVT_LOCAL_TOKEN_ID: z.string(),

  TVT_TESTNET_OPERATOR_ID: z.string().optional(),
  TVT_TESTNET_OPERATOR_KEY: z.string().optional(),
  TVT_TESTNET_TOPIC_ID: z.string().optional(),
  TVT_TESTNET_CONTRACT_FILE_ID: z.string(),
  TVT_TESTNET_CONTRACT_ID: z.string(),
  TVT_TESTNET_TOKEN_ID: z.string(),

  TVT_MAINNET_OPERATOR_ID: z.string().optional(),
  TVT_MAINNET_OPERATOR_KEY: z.string().optional(),
  TVT_MAINNET_TOPIC_ID: z.string().optional(),
  TVT_MAINNET_CONTRACT_FILE_ID: z.string(),
  TVT_MAINNET_CONTRACT_ID: z.string(),
  TVT_MAINNET_TOKEN_ID: z.string(),
});

export const envs = configSchema.parse(process.env);

type ConfigSchema = NonNullable<z.infer<typeof configSchema>>;
type ConfigKey = keyof ConfigSchema;
type KeysWithPrefix<P extends ConfigPrefix> = Extract<ConfigKey, `${P}_${string}`>;

type SuffixesForPrefix<P extends ConfigPrefix> = {
  [Key in keyof ConfigSchema]: Key extends `${P}_${infer Suffix}` ? Suffix : never;
}[keyof ConfigSchema]; //ConfigKey extends `${P}_${infer Suffix}` ? Suffix : never;

export const getEnv = <P extends ConfigPrefix, K extends SuffixesForPrefix<P>>({
  key,
  prefix,
}: {
  prefix: P;
  key: K;
}) => {
  return envs[`${prefix}_${key}` as keyof typeof envs];
};

export class Config {
  config: LocalConfig | ExternalConfig;

  private constructor(config: LocalConfig | ExternalConfig) {
    this.config = config;
  }

  private static async setLocalNetwork() {
    const validateNetworkPattern =
      /^(?:(https?:\/\/)([^\s\/$.?#].[^\s]*)|(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})$/i;
    return inquirer.prompt<{ localAddress: string }>([
      {
        type: 'input',
        name: 'localAddress',
        message: 'Input local network address, eg.',
        validate: function (v) {
          return new Promise(async (resolve, reject) => {
            if (!v) reject();
            const isValid = validateNetworkPattern.test(v);
            if (!isValid) reject();
            await Promise.all([httpPing({ address: `${v}:5600` }), httpPing({ address: `${v}:50211` })]);
            resolve(true);
          });
        },
      },
    ]);
  }

  private static async initCredentials(network: Network) {
    const shortcut = network === 'localnet' ? 'LOCAL' : network === 'mainnet' ? 'MAINNET' : 'TESTNET';
    const prefix = `TVT_${shortcut}` as const;

    let operatorId = envs[`${prefix}_OPERATOR_ID`];
    if (!operatorId) {
      console.log(chalk.yellow('Operator id is unset'));
      const { id } = await inquirer.prompt<{ id: string }>([
        {
          message: 'Input operator id',
          name: 'id',
          type: 'input',
          validate: (v) => !!v,
        },
      ]);
      operatorId = id;
    }

    let operatorKey = envs[`${prefix}_OPERATOR_KEY`];
    if (!operatorKey) {
      console.log(chalk.yellow('Operator key is unset'));
      const { key } = await inquirer.prompt<{ key: string }>({
        message: 'Input operator key',
        name: 'key',
        type: 'input',
        validate: (v) => !!v,
      });
      operatorKey = key;
    }

    const JSON_TO_SAVE = {
      [`${prefix}_OPERATOR_ID`]: operatorId,
      [`${prefix}_OPERATOR_KEY`]: operatorKey,
    };

    return { operatorId, operatorKey, JSON_TO_SAVE };
  }

  private static async initLocalNetwork() {
    let address = envs.TVT_LOCAL_NETWORK_IP;
    if (!address) {
      const { localAddress } = await this.setLocalNetwork();
      address = localAddress;
    }
    const { operatorId, operatorKey, JSON_TO_SAVE } = await Config.initCredentials('localnet');
    return { address, operatorId, operatorKey, JSON_TO_SAVE: { ...JSON_TO_SAVE, TVT_LOCAL_NETWORK_IP: address } };
  }

  static async create() {
    const { network } = await inquirer.prompt<{ network: Network }>([
      {
        type: 'list',
        name: 'network',
        message: 'Select network',
        choices: ['mainnet', 'testnet', 'localnet'],
      },
    ]);
    let configInitializer: LocalConfig | ExternalConfig;
    let newConfigFile: Record<string, string> = {};
    switch (network) {
      case 'localnet':
        {
          const { address, operatorId, operatorKey, JSON_TO_SAVE } = await this.initLocalNetwork();
          configInitializer = { network: 'localnet', networkIp: address, operatorId, operatorKey };
          newConfigFile = JSON_TO_SAVE;
        }
        break;
      case 'mainnet':
      case 'testnet':
        {
          const { operatorId, operatorKey, JSON_TO_SAVE } = await this.initCredentials(network);
          configInitializer = { network, operatorId, operatorKey };
          newConfigFile = JSON_TO_SAVE;
        }
        break;
    }

    if (!fsSync.existsSync(CONFIG_PATH)) {
      await fs.mkdir(CONFIG_PATH, { recursive: true });
    }

    await fs.writeFile(CONFIG_FILE_PATH, `CONFIG=${JSON.stringify({ ...envs, ...newConfigFile })}\n`, {
      encoding: 'utf-8',
    });
    return new Config(configInitializer);
  }
}
