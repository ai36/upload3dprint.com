// spec §2, FR-012: shared order access and status changes for checkout, webhook and admin.
import { HttpError, type Env } from './_lib.ts';
import { integrations } from '../_integrations/index.ts';
import { assertTransition, LABELS, type Status } from '../../src/orderStatus.ts';

export interface Order {
  id: number;
  public_no: string;
  email: string;
  address: string | null;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  status: Status;
  tracking_no: string | null;
  stripe_session_id: string | null;
  created_at: string;
  due_date: string | null;
}

export interface Item {
  model_id: string;
  r2_key: string;
  filename: string;
  units: string;
  bbox: string | null;
  volume_cm3: number;
  material_id: string;
  material: string;
  color: string;
  qty: number;
  unit_price_cents: number;
}

export const USPS_TRACKING = 'https://tools.usps.com/go/TrackConfirmAction?tLabels=';

export async function findOrder(db: Env['DB'], public_no: unknown): Promise<Order> {
  const o = await db.prepare('SELECT * FROM orders WHERE public_no = ?').bind(String(public_no ?? '')).first<Order>();
  if (!o) throw new HttpError(404, 'Order not found');
  return o;
}

export async function orderItems(db: Env['DB'], orderId: number): Promise<Item[]> {
  const { results } = await db
    .prepare(
      `SELECT oi.model_id, m.r2_key, m.filename, m.units, m.bbox, m.volume_cm3, oi.material_id, mat.name AS material, oi.color, oi.qty, oi.unit_price_cents
       FROM order_items oi JOIN models m ON m.id = oi.model_id JOIN materials mat ON mat.id = oi.material_id
       WHERE oi.order_id = ? ORDER BY oi.id`,
    )
    .bind(orderId)
    .all<Item>();
  return results;
}

/** Changes the status (spec §2), writes history and emails the buyer on every change except draft. */
export async function setStatus(env: Env, order: Order, to: Status, opts: { note?: string; data?: Record<string, unknown> } = {}) {
  try {
    assertTransition(order.status, to);
  } catch (e) {
    throw new HttpError(409, (e as Error).message);
  }
  const at = new Date().toISOString();
  await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(to, order.id).run();
  await env.DB.prepare('INSERT INTO status_history (order_id, status, at, note) VALUES (?, ?, ?, ?)').bind(order.id, to, at, opts.note ?? null).run();
  order.status = to;
  const template = to === 'paid' ? 'order_confirmation' : to === 'shipped' ? 'shipped' : to === 'cancelled' ? 'cancelled' : 'status_changed';
  const tracking = order.tracking_no ? { tracking_no: order.tracking_no, tracking_url: USPS_TRACKING + encodeURIComponent(order.tracking_no) } : {};
  await integrations(env).email.send(order.email, template, {
    order: order.public_no,
    status: to,
    status_label: LABELS[to],
    ...(opts.note ? { note: opts.note } : {}),
    ...tracking,
    ...opts.data,
  });
}
