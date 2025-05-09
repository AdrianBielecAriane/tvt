import { z } from 'zod';
import fs from 'fs/promises';
import { httpPing } from '../utils/http-ping';
import { ConfigPrefix } from './hedera';
import { getArg } from '../utils/get-arg';
import { invariant } from '../utils/invariant';
import { omit } from 'remeda';

const networkOptions = ['mainnet', 'testnet', 'localnet'] as const;
export type Network = (typeof networkOptions)[number];

interface ConfigShared {
  reInit: boolean;
  operatorKey: string;
  operatorKeyType: 'ED25519' | 'ECDSA';
}

type LocalConfig = {
  network: Exclude<Network, 'mainnet' | 'testnet'>;
  operatorId: string;
  networkIp: string;
};

type ExternalConfig = {
  network: Exclude<Network, 'localnet'>;
  operatorId: string;
  networkIp?: never;
};

type ConfigObj = ConfigShared & (LocalConfig | ExternalConfig);

const configSchema = z.object({
  TVT_LOCAL_OPERATOR_ID: z.string().optional(),
  TVT_LOCAL_OPERATOR_KEY: z.string().optional(),
  TVT_LOCAL_OPERATOR_KEY_TYPE: z.enum(['ED25519', 'ECDSA']).optional(),
  TVT_LOCAL_NETWORK_IP: z.string().optional(),
  TVT_LOCAL_TOPIC_ID: z.string().optional(),
  TVT_LOCAL_CONTRACT_FILE_ID: z.string().optional(),
  TVT_LOCAL_CONTRACT_ID: z.string().optional(),
  TVT_LOCAL_TOKEN_ID: z.string().optional(),
  TVT_LOCAL_WALLET_ID: z.string().optional(),
  TVT_LOCAL_FILE_ID: z.string().optional(),
  TVT_LOCAL_FUNGIBLE_TOKEN_ID: z.string().optional(),

  TVT_TESTNET_OPERATOR_ID: z.string().optional(),
  TVT_TESTNET_OPERATOR_KEY: z.string().optional(),
  TVT_TESTNET_OPERATOR_KEY_TYPE: z.enum(['ED25519', 'ECDSA']).optional(),
  TVT_TESTNET_TOPIC_ID: z.string().optional(),
  TVT_TESTNET_CONTRACT_FILE_ID: z.string().optional(),
  TVT_TESTNET_CONTRACT_ID: z.string().optional(),
  TVT_TESTNET_TOKEN_ID: z.string().optional(),
  TVT_TESTNET_WALLET_ID: z.string().optional(),
  TVT_TESTNET_FILE_ID: z.string().optional(),
  TVT_TESTNET_FUNGIBLE_TOKEN_ID: z.string().optional(),

  TVT_MAINNET_OPERATOR_ID: z.string().optional(),
  TVT_MAINNET_OPERATOR_KEY: z.string().optional(),
  TVT_MAINNET_OPERATOR_KEY_TYPE: z.enum(['ED25519', 'ECDSA']).optional(),
  TVT_MAINNET_TOPIC_ID: z.string().optional(),
  TVT_MAINNET_CONTRACT_FILE_ID: z.string().optional(),
  TVT_MAINNET_CONTRACT_ID: z.string().optional(),
  TVT_MAINNET_TOKEN_ID: z.string().optional(),
  TVT_MAINNET_WALLET_ID: z.string().optional(),
  TVT_MAINNET_FILE_ID: z.string().optional(),
  TVT_MAINNET_FUNGIBLE_TOKEN_ID: z.string().optional(),
});

try {
  await fs.access('config.json', fs.constants.F_OK);
} catch {
  await fs.writeFile('config.json', `{}`, { encoding: 'utf-8' });
}

// Always load fresh envs
export const getEnvsFile = async () => {
  const configFile = await fs.readFile('config.json', { encoding: 'utf-8' });
  return configSchema.parse(JSON.parse(configFile));
};

let envs = await getEnvsFile();

type ConfigSchema = NonNullable<z.infer<typeof configSchema>>;

type SuffixesForPrefix<P extends ConfigPrefix> = {
  [Key in keyof ConfigSchema]: Key extends `${P}_${infer Suffix}` ? Suffix : never;
}[keyof ConfigSchema];

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
  config: ConfigObj;

  private constructor(config: ConfigObj) {
    this.config = config;
  }

  private static async setLocalNetwork() {
    const validateNetworkPattern =
      /^(?:(https?:\/\/)([^\s\/$.?#].[^\s]*)|(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})$/i;
    return getArg({
      argName: 'network-address',
      validate: async (v) => {
        invariant(v, 'You have to pass network-address');
        const isValid = validateNetworkPattern.test(v);
        invariant(isValid, 'Network address is not valid');
        await Promise.all([httpPing({ address: `${v}:5600` }), httpPing({ address: `${v}:50211` })]);
        return v;
      },
    });
  }

  private static async initCredentials(network: Network) {
    const shortcut = network === 'localnet' ? 'LOCAL' : network === 'mainnet' ? 'MAINNET' : 'TESTNET';
    const prefix = `TVT_${shortcut}` as const;

    const operatorId =
      (await getArg({
        argName: 'operator-id',
        validate: (v) => v,
      })) ?? envs[`${prefix}_OPERATOR_ID`];
    invariant(operatorId, 'You have to pass operator-id in args');
    const isNewOperatorId = operatorId !== envs[`${prefix}_OPERATOR_ID`];

    const keyType = await getArg({
      argName: 'key-type',
      validate: (v) => {
        if (!v) return 'ECDSA';
        return z.enum(['ED25519', 'ECDSA']).parse(v.toUpperCase());
      },
    });

    const operatorKey =
      (await getArg({
        argName: 'operator-key',
        validate: (v) => v,
      })) ?? envs[`${prefix}_OPERATOR_KEY`];
    invariant(operatorKey, 'You have to pass operator-key in args');
    const isNewOperatorKey = operatorKey !== envs[`${prefix}_OPERATOR_KEY`];

    const JSON_TO_SAVE = {
      [`${prefix}_OPERATOR_ID`]: operatorId,
      [`${prefix}_OPERATOR_KEY`]: operatorKey,
      [`${prefix}_OPERATOR_KEY_TYPE`]: keyType,
    };

    return { operatorId, operatorKey, JSON_TO_SAVE, keyType, isNewOperatorId, isNewOperatorKey };
  }

  private static async initLocalNetwork() {
    let address = envs.TVT_LOCAL_NETWORK_IP;
    if (!address) {
      address = await this.setLocalNetwork();
    }
    const { operatorId, operatorKey, JSON_TO_SAVE, keyType, isNewOperatorId, isNewOperatorKey } =
      await Config.initCredentials('localnet');
    return {
      address,
      operatorId,
      operatorKey,
      isNewOperatorId,
      isNewOperatorKey,
      keyType,
      JSON_TO_SAVE: { ...JSON_TO_SAVE, TVT_LOCAL_NETWORK_IP: address },
    };
  }

  static async create(network: Network) {
    let configInitializer: ConfigObj;
    let newConfigFile: Record<string, string> = {};
    switch (network) {
      case 'localnet':
        {
          const { address, operatorId, operatorKey, JSON_TO_SAVE, keyType, isNewOperatorId, isNewOperatorKey } =
            await this.initLocalNetwork();
          configInitializer = {
            network: 'localnet',
            networkIp: address,
            operatorId,
            operatorKey,
            reInit: isNewOperatorId || isNewOperatorKey,
            operatorKeyType: keyType,
          };
          newConfigFile = JSON_TO_SAVE;
        }
        break;
      case 'mainnet':
      case 'testnet':
        {
          const { operatorId, operatorKey, JSON_TO_SAVE, keyType, isNewOperatorId, isNewOperatorKey } =
            await this.initCredentials(network);
          configInitializer = {
            network,
            operatorId,
            operatorKey,
            operatorKeyType: keyType,
            reInit: isNewOperatorId || isNewOperatorKey,
          };
          newConfigFile = JSON_TO_SAVE;
        }
        break;
    }
    const shortcut = network === 'localnet' ? 'LOCAL' : network === 'mainnet' ? 'MAINNET' : 'TESTNET';
    const prefix = `TVT_${shortcut}` as const;
    const validEnvs = configInitializer.reInit
      ? omit(envs, [
          `${prefix}_TOPIC_ID`,
          `${prefix}_CONTRACT_FILE_ID`,
          `${prefix}_CONTRACT_ID`,
          `${prefix}_TOKEN_ID`,
          `${prefix}_WALLET_ID`,
          `${prefix}_FILE_ID`,
          `${prefix}_FUNGIBLE_TOKEN_ID`,
        ])
      : envs;
    envs = { ...validEnvs };
    await fs.writeFile('config.json', JSON.stringify({ ...validEnvs, ...newConfigFile }), {
      encoding: 'utf-8',
    });
    return new Config(configInitializer);
  }
}
