// FR-008, FR-012, P1 «Оформить» 3–4, P1 «Изготовление» 1: payment result → order paid → buyer and operator emails (T025).
import { HttpError, json, preflight, route } from './_lib.ts';
import { getSettings, loadCatalog } from './catalog.ts';
import { findOrder, orderItems, setStatus, type Order } from './_orders.ts';
import { integrations } from '../_integrations/index.ts';
import { leadDays } from '../../src/pricing.ts';

export const onRequestOptions = preflight;
export const onRequestPost = route(async (ctx) => {
  const env = ctx.env;
  const { payments, storage, email } = integrations(env);
  const event = await payments.parseWebhook(ctx.request);
  const row = await env.DB.prepare('SELECT public_no FROM orders WHERE stripe_session_id = ?').bind(event.session_id).first<{ public_no: string }>();
  if (!row) throw new HttpError(404, 'Unknown checkout session');
  const order: Order = await findOrder(env.DB, row.public_no);

  // Declined: the order stays an unpaid draft; the page restores the model and settings.
  if (event.type === 'declined' || order.status !== 'draft') return json(ctx, { order: order.public_no, status: order.status });

  const items = await orderItems(env.DB, order.id);
  const days = leadDays(await loadCatalog(env.DB));
  const subtotal = order.total_cents - order.shipping_cents - order.tax_cents;
  await setStatus(env, order, 'paid', {
    data: {
      items: items.map((i) => ({ file: i.filename, material: i.material, color: i.color, qty: i.qty, unit_cents: i.unit_price_cents })),
      subtotal_cents: subtotal,
      shipping_cents: order.shipping_cents,
      tax_cents: order.tax_cents,
      total_cents: order.total_cents,
      days, // business days, shown as a range (principle II)
      due_date: order.due_date,
    },
  });
  const s = await getSettings(env.DB);
  await email.send(s.operator_email, 'new_order', {
    order: order.public_no,
    email: order.email,
    address: JSON.parse(order.address ?? '{}'),
    due_date: order.due_date,
    items: await Promise.all(
      items.map(async (i) => ({
        file: i.filename,
        download_url: await storage.downloadUrl(i.r2_key),
        material: i.material,
        color: i.color,
        qty: i.qty,
        units: i.units,
        size_mm: JSON.parse(i.bbox ?? 'null'),
        volume_cm3: i.volume_cm3,
      })),
    ),
  });
  return json(ctx, { order: order.public_no, status: order.status });
});
