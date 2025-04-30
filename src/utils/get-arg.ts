import { invariant } from './invariant';

interface Config<T> {
  argName: string;
  validate: (value: string | undefined) => T;
}

export const getArg = <T>({ argName, validate }: Config<T>) => {
  const arg = process.argv.find((val) => val.startsWith(`--${argName}`));
  const argValue = arg?.split('=')[1];
  return validate(argValue);
};
