// FR-013: every /api/admin function goes through auth.isOperator (plan §2.3).
import { HttpError, route, type Context } from '../_lib.ts';
import { integrations } from '../../_integrations/index.ts';

export const admin = (fn: (ctx: Context) => Promise<Response>) =>
  route(async (ctx) => {
    if (!(await integrations(ctx.env).auth.isOperator(ctx.request))) throw new HttpError(403, 'Operators only');
    return fn(ctx);
  });
