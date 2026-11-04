// plan §2.3 tax adapter: FR-011. Stub = flat rate from settings (default 0).
import type { Env } from '../api/_lib.ts';
import { getSettings } from '../api/catalog.ts';
import type { Address } from './shipping.ts';

export interface Tax {
  calc(address: Address, amount_cents: number): Promise<number>;
}

export function stub(env: Env): Tax {
  return {
    async calc(_address, amount_cents) {
      const s = await getSettings(env.DB);
      return Math.round(amount_cents * (Number(s.tax_rate) || 0));
    },
  };
}
