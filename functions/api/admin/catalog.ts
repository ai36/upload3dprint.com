// FR-005, FR-007, NFR-005: operator edits materials, colors, executor and settings without code changes (T035).
import { body, HttpError, json, preflight } from '../_lib.ts';
import { admin } from './_auth.ts';
import { getSettings } from '../catalog.ts';

const num = (v: unknown, name: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${name} must be a number ≥ 0`);
  return n;
};
const text = (v: unknown, name: string) => {
  const s = String(v ?? '').trim();
  if (!s) throw new HttpError(400, `${name} is required`);
  return s;
};
const list = (v: unknown, name: string) => {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && x.trim())) throw new HttpError(400, `${name} must be a list of names`);
  return JSON.stringify(v.map((x) => x.trim()));
};

export const onRequestOptions = preflight;

export const onRequestGet = admin(async (ctx) => {
  const db = ctx.env.DB;
  const parse = <T extends Record<string, any>>(rows: T[], keys: string[]) => rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, JSON.parse(r[k])])) }));
  const technologies = (await db.prepare('SELECT * FROM technologies ORDER BY id').all()).results;
  const materials = parse((await db.prepare('SELECT * FROM materials ORDER BY id').all()).results, ['colors']);
  const executors = parse((await db.prepare('SELECT * FROM executors ORDER BY id').all()).results, ['technology_ids']);
  return json(ctx, { technologies, materials, executors, settings: await getSettings(db) });
});

export const onRequestPost = admin(async (ctx) => {
  const r = await body<Record<string, any>>(ctx);
  const db = ctx.env.DB;
  if (r.kind === 'material') {
    await db
      .prepare(
        `INSERT INTO materials (id, name, technology_id, price_per_cm3, colors, active) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, technology_id = excluded.technology_id, price_per_cm3 = excluded.price_per_cm3, colors = excluded.colors, active = excluded.active`,
      )
      .bind(text(r.id, 'id'), text(r.name, 'name'), text(r.technology_id, 'technology_id'), num(r.price_per_cm3, 'price_per_cm3'), list(r.colors, 'colors'), r.active ? 1 : 0)
      .run();
  } else if (r.kind === 'executor') {
    await db
      .prepare(
        `INSERT INTO executors (id, name, technology_ids, build_x_mm, build_y_mm, build_z_mm, lead_days_min, lead_days_max, pickup_address, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, technology_ids = excluded.technology_ids, build_x_mm = excluded.build_x_mm, build_y_mm = excluded.build_y_mm,
           build_z_mm = excluded.build_z_mm, lead_days_min = excluded.lead_days_min, lead_days_max = excluded.lead_days_max, pickup_address = excluded.pickup_address, active = excluded.active`,
      )
      .bind(
        text(r.id, 'id'), text(r.name, 'name'), list(r.technology_ids, 'technology_ids'),
        num(r.build_x_mm, 'build_x_mm'), num(r.build_y_mm, 'build_y_mm'), num(r.build_z_mm, 'build_z_mm'),
        num(r.lead_days_min, 'lead_days_min'), num(r.lead_days_max, 'lead_days_max'), r.pickup_address ? String(r.pickup_address) : null, r.active ? 1 : 0,
      )
      .run();
  } else if (r.kind === 'setting') {
    if (r.value === undefined) throw new HttpError(400, 'value is required');
    await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(text(r.key, 'key'), JSON.stringify(r.value)).run();
  } else throw new HttpError(400, 'kind must be material, executor or setting');
  return json(ctx, { ok: true });
});
