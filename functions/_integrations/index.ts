// plan §2.3: picks the implementation of each external service by INTEGRATIONS=stub|live.
import type { Env } from '../api/_lib.ts';
import * as payments from './payments.ts';
import * as tax from './tax.ts';
import * as shipping from './shipping.ts';
import * as email from './email.ts';
import * as auth from './auth.ts';
import * as storage from './storage.ts';

export interface Integrations {
  payments: payments.Payments;
  tax: tax.Tax;
  shipping: shipping.Shipping;
  email: email.Email;
  auth: auth.Auth;
  storage: storage.Storage;
}

/** Live adapters are separate tasks, written when the accounts exist. */
function notYet<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get: () => () => Promise.reject(new Error(`Live ${name} integration is not implemented yet`)),
  });
}

export function integrations(env: Env): Integrations {
  const mode = env.INTEGRATIONS ?? 'stub';
  if (mode === 'stub')
    return { payments: payments.stub(env), tax: tax.stub(env), shipping: shipping.stub(env), email: email.stub(env), auth: auth.stub(env), storage: storage.stub(env) };
  if (mode === 'live')
    return { payments: notYet('payments'), tax: notYet('tax'), shipping: notYet('shipping'), email: notYet('email'), auth: notYet('auth'), storage: storage.live(env) };
  throw new Error(`INTEGRATIONS must be "stub" or "live", got "${mode}"`);
}
