// spec §2, P1 «Изготовление» 2: status change through src/orderStatus.ts, history, buyer email (T031).
import { body, HttpError, json, preflight } from '../_lib.ts';
import { admin } from './_auth.ts';
import { findOrder, setStatus } from '../_orders.ts';
import { isStatus } from '../../../src/orderStatus.ts';

export const onRequestOptions = preflight;
export const onRequestPost = admin(async (ctx) => {
  const r = await body<{ order: string; status: string; note?: string }>(ctx);
  if (!isStatus(r.status)) throw new HttpError(400, 'Unknown status');
  // Shipping and cancelling have their own steps: label purchase and refund.
  if (r.status === 'shipped') throw new HttpError(400, 'Buy a label to mark the order shipped');
  if (r.status === 'cancelled') throw new HttpError(400, 'Use cancel to refund and cancel the order');
  const order = await findOrder(ctx.env.DB, r.order);
  await setStatus(ctx.env, order, r.status, { note: r.note?.trim() || undefined });
  return json(ctx, { order: order.public_no, status: order.status });
});
