import { z } from 'zod';

const hbarPriceResponse = z.object({
  'hedera-hashgraph': z.object({ usd: z.number() }),
});

class CoingekoApi {
  async getHbarPriceInUsd() {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd',
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );
    if (!response.ok) {
      throw new Error('Response is not valid');
    }

    return hbarPriceResponse.parse(await response.json());
  }
}

export const coingekoApi = new CoingekoApi();
