// FR-006, FR-008, FR-011, plan §4: draft order with items, shipping, tax, total and due date → payment URL (T024).
import { body, HttpError, json, preflight, route } from './_lib.ts';
import { getSettings, loadCatalog } from './catalog.ts';
import { parcel } from './shipping.ts';
import { integrations } from '../_integrations/index.ts';
import type { Address } from '../_integrations/shipping.ts';
import { addBusinessDays, leadDays, quote } from '../../src/pricing.ts';
import type { Size, Units } from '../../src/geometry.ts';

interface CheckoutItem {
  model_id: string;
  material_id: string;
  color: string;
  qty: number;
  units: Units;
  size: Size; // mm, after units and scale
  volume_cm3: number; // after units and scale
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const publicNo = () => 'U' + [...crypto.getRandomValues(new Uint8Array(7))].map((b) => ALPHABET[b % ALPHABET.length]).join('');

export const onRequestOptions = preflight;
export const onRequestPost = route(async (ctx) => {
  const r = await body<{ email: string; address: Partial<Address>; items: CheckoutItem[] }>(ctx);
  const env = ctx.env;
  const email = String(r.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid e-mail');
  if (!Array.isArray(r.items) || !r.items.length) throw new HttpError(400, 'items are required');
  const { shipping, tax, payments } = integrations(env);
  const address = await shipping.validate(r.address ?? {});
  const catalog = await loadCatalog(env.DB);

  const lines = [];
  for (const i of r.items) {
    if (!Array.isArray(i.size) || i.size.length !== 3 || !i.size.every((v) => typeof v === 'number' && v > 0)) throw new HttpError(400, 'size must be [x, y, z] in mm');
    if (i.units !== 'mm' && i.units !== 'in') throw new HttpError(400, 'units must be "mm" or "in"');
    const model = await env.DB.prepare('SELECT r2_key FROM models WHERE id = ?').bind(String(i.model_id)).first<{ r2_key: string }>();
    if (!model || !(await env.FILES.head(model.r2_key))) throw new HttpError(400, 'The model file has not been uploaded');
    let q;
    try {
      q = quote(catalog, i);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    if (!q.fits) throw new HttpError(400, 'The model does not fit the print area');
    lines.push({ ...i, ...q });
  }

  const subtotal = lines.reduce((a, l) => a + l.total_cents, 0);
  const rate = await shipping.rate(parcel(lines, await getSettings(env.DB)), address.zip);
  const tax_cents = await tax.calc(address, subtotal + rate.cents);
  const total_cents = subtotal + rate.cents + tax_cents;
  const days = leadDays(catalog, rate.days);
  const due_date = addBusinessDays(new Date(), days.max);
  const no = publicNo();

  const order = await env.DB.prepare(
    `INSERT INTO orders (public_no, email, address, shipping_cents, tax_cents, total_cents, status, due_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?) RETURNING id`,
  )
    .bind(no, email, JSON.stringify(address), rate.cents, tax_cents, total_cents, due_date, new Date().toISOString())
    .first<{ id: number }>();
  for (const l of lines) {
    // Final metrics (units and scale applied) are what the operator prints.
    await env.DB.prepare('UPDATE models SET units = ?, bbox = ?, volume_cm3 = ? WHERE id = ?').bind(l.units, JSON.stringify(l.size), l.volume_cm3, l.model_id).run();
    await env.DB.prepare('INSERT INTO order_items (order_id, model_id, material_id, color, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(order!.id, l.model_id, l.material_id, l.color, l.qty, l.unit_cents)
      .run();
  }
  await env.DB.prepare("INSERT INTO status_history (order_id, status, at) VALUES (?, 'draft', ?)").bind(order!.id, new Date().toISOString()).run();
  const { url, session_id } = await payments.createCheckout({ public_no: no, email, total_cents });
  await env.DB.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').bind(session_id, order!.id).run();

  return json(ctx, { order: no, subtotal_cents: subtotal, shipping_cents: rate.cents, tax_cents, total_cents, days, due_date, url });
});
