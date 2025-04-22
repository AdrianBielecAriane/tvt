export const sleep = async (timeToSleep: number) => {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, timeToSleep);
  });
};
