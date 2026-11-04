// FR-005–FR-007, plan §2.2: GET active catalog and the settings the browser needs.
import { json, preflight, route, type Env } from './_lib.ts';
import type { Catalog } from '../../src/pricing.ts';

export async function getSettings(db: Env['DB']): Promise<Record<string, any>> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)]));
}

export async function loadCatalog(db: Env['DB']): Promise<Catalog> {
  const ex = await db
    .prepare('SELECT * FROM executors WHERE active = 1 ORDER BY id LIMIT 1')
    .first<{ id: string; technology_ids: string; build_x_mm: number; build_y_mm: number; build_z_mm: number; lead_days_min: number; lead_days_max: number }>();
  if (!ex) throw new Error('No active executor');
  const techs: string[] = JSON.parse(ex.technology_ids);
  const { results } = await db
    .prepare('SELECT id, name, technology_id, price_per_cm3, colors FROM materials WHERE active = 1 ORDER BY id')
    .all<{ id: string; name: string; technology_id: string; price_per_cm3: number; colors: string }>();
  const s = await getSettings(db);
  return {
    materials: results.filter((m) => techs.includes(m.technology_id)).map((m) => ({ ...m, colors: JSON.parse(m.colors) })),
    executor: { id: ex.id, build_mm: [ex.build_x_mm, ex.build_y_mm, ex.build_z_mm], lead_days_min: ex.lead_days_min, lead_days_max: ex.lead_days_max },
    settings: {
      markup: s.markup,
      min_price: s.min_price,
      volume_discounts: s.volume_discounts,
      max_file_mb: s.max_file_mb,
      usps_transit_days_min: s.usps_transit_days_min,
      usps_transit_days_max: s.usps_transit_days_max,
    },
  };
}

export const onRequestOptions = preflight;
export const onRequestGet = route(async (ctx) => json(ctx, await loadCatalog(ctx.env.DB)));
