import { logger } from './logger';

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    logger.error(message);
    throw new Error(message);
  }
}
