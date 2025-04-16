import os from 'os';
import path from 'path';
import { configDotenv } from 'dotenv';

export const CONFIG_PATH = path.join(os.homedir(), 'tvt');
export const CONFIG_FILE_PATH = path.join(CONFIG_PATH, '.config');

configDotenv({
  path: CONFIG_FILE_PATH,
});
