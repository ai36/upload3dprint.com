// FR-009, FR-010, P1 «Оформить» 1–2: US address + parcel → USPS cost and transit days (T022).
import { body, HttpError, json, preflight, route } from './_lib.ts';
import { getSettings } from './catalog.ts';
import { integrations } from '../_integrations/index.ts';
import type { Address, Parcel } from '../_integrations/shipping.ts';

export interface ParcelItem {
  material_id: string;
  volume_cm3: number;
  qty: number;
}

/** Weight from volume × material density × qty plus packaging (settings). */
export function parcel(items: ParcelItem[], s: Record<string, any>): Parcel {
  const density: Record<string, number> = s.material_density_g_cm3;
  let weight_g = s.packaging.weight_g;
  for (const i of items) {
    const d = density[i.material_id];
    if (!d) throw new HttpError(400, `No density for material "${i.material_id}"`);
    if (!(i.volume_cm3 > 0) || !Number.isInteger(i.qty) || i.qty < 1) throw new HttpError(400, 'Each item needs volume_cm3 > 0 and a whole qty ≥ 1');
    weight_g += i.volume_cm3 * d * i.qty;
  }
  return { weight_g: Math.ceil(weight_g), size_mm: s.packaging.size_mm };
}

export const onRequestOptions = preflight;
export const onRequestPost = route(async (ctx) => {
  const r = await body<{ address: Partial<Address>; items: ParcelItem[] }>(ctx);
  if (!Array.isArray(r.items) || !r.items.length) throw new HttpError(400, 'items are required');
  const { shipping } = integrations(ctx.env);
  const address = await shipping.validate(r.address ?? {});
  const p = parcel(r.items, await getSettings(ctx.env.DB));
  const rate = await shipping.rate(p, address.zip);
  return json(ctx, { shipping_cents: rate.cents, days: rate.days, weight_g: p.weight_g });
});
