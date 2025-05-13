import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Config } from './config';
import { logger } from '../utils/logger';

export class Pid {
  pidPath;
  private constructor(path: string) {
    this.pidPath = path;
  }

  static async startProgram({ config }: Config) {
    if (!fsSync.existsSync('pid')) {
      await fs.mkdir('pid');
    }
    const programPath = path.join(process.cwd(), 'work', 'pid', `${config.operatorId}-${config.network}.pid`);
    if (fsSync.existsSync(programPath)) {
      logger.error(
        `Running CLI using multiple instances for single account may create errors related to creating translations`
      );
      logger.warn(`To force run application remove PID folder`);
      logger.warn('Stopping cli');
      process.exit(0);
    }
    await fs.writeFile(programPath, process.pid.toString(), { encoding: 'utf8' });
    return new Pid(programPath);
  }

  async unlinkPid() {
    await fs.unlink(this.pidPath);
  }
}
