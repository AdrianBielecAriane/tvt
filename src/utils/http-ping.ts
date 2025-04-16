const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const;

interface Config {
  address: string;
}

export const httpPing = async ({ address }: Config) => {
  let isAnyOk = false;
  for (const method of methods) {
    try {
      await fetch(address, { method });
      isAnyOk = true;
      break;
    } catch (e) {
      if (
        e instanceof TypeError &&
        typeof e.cause === 'object' &&
        !!e.cause &&
        'code' in e.cause &&
        e.cause.code !== 'ECONNREFUSED'
      ) {
        isAnyOk = true;
        break;
      }
    }
  }
  if (!isAnyOk) {
    throw new Error(`Host: ${address}, is unreachable`);
  }
};
