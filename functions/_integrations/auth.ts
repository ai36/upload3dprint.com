// plan §2.3 operator auth adapter: FR-013. Live = Cloudflare Access in front of /admin; stub lets everyone in.
import type { Env } from '../api/_lib.ts';

export interface Auth {
  isOperator(request: Request): Promise<boolean>;
}

export function stub(env: Env): Auth {
  return { isOperator: async () => env.INTEGRATIONS === 'stub' };
}
