import chalk from 'chalk';
import path from 'path';
import winston, { transports } from 'winston';
import os from 'os';

const { combine, timestamp, printf } = winston.format;
const consoleFormat = printf(({ level, message, timestamp }) => {
  var levelUpper = level.toUpperCase();
  switch (levelUpper) {
    case 'INFO':
      message = chalk.green(message);
      level = chalk.green(level);
      break;

    case 'WARN':
      message = chalk.yellow(message);
      level = chalk.yellow(level);
      break;

    case 'ERROR':
      message = chalk.red(message);
      level = chalk.red(level);
      break;

    default:
      break;
  }
  return `[${chalk.black(timestamp)}] [${level}]: ${message}`;
});

export const logger = winston.createLogger({
  level: 'info',
  format: combine(timestamp(), winston.format.splat(), consoleFormat),
  defaultMeta: { service: 'logger' },
  transports: [
    new transports.Console(),
    new winston.transports.File({ filename: path.join(os.homedir(), 'tvt', 'logs', 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(os.homedir(), 'tvt', 'logs', 'combined.log') }),
  ],
});
