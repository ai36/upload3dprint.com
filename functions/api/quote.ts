// FR-005–FR-007, plan §2.2: POST metrics + choice → price and lead time (same code as the browser).
import { body, HttpError, json, preflight, route } from './_lib.ts';
import { loadCatalog } from './catalog.ts';
import { quote, type QuoteInput } from '../../src/pricing.ts';

export const onRequestOptions = preflight;
export const onRequestPost = route(async (ctx) => {
  const q = await body<QuoteInput>(ctx);
  if (!Array.isArray(q.size) || q.size.length !== 3 || !q.size.every((v) => typeof v === 'number' && v > 0))
    throw new HttpError(400, 'size must be [x, y, z] in mm');
  const catalog = await loadCatalog(ctx.env.DB);
  try {
    return json(ctx, quote(catalog, q));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
