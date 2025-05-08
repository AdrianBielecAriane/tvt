interface Config<T> {
  argName: string;
  validate: (value: string | undefined) => T | Promise<T>;
}

export const getArg = <T>({ argName, validate }: Config<T>) => {
  const arg = process.argv.find((val) => val.startsWith(`--${argName}`));
  const [argKey, argValue] = arg?.split('=') ?? [];
  if (argKey !== `--${argName}`) return validate(undefined);

  return validate(argValue);
};
