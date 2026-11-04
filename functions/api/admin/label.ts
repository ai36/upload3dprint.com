// FR-018, P2 «Отслеживание» 1: USPS label → tracking number, status shipped, email with tracking link (T032).
import { body, HttpError, json, preflight } from '../_lib.ts';
import { admin } from './_auth.ts';
import { findOrder, setStatus } from '../_orders.ts';
import { integrations } from '../../_integrations/index.ts';
import { canTransition } from '../../../src/orderStatus.ts';

export const onRequestOptions = preflight;
export const onRequestPost = admin(async (ctx) => {
  const r = await body<{ order: string }>(ctx);
  const order = await findOrder(ctx.env.DB, r.order);
  if (!canTransition(order.status, 'shipped')) throw new HttpError(409, 'A label can be bought only for an order that is ready for pickup');
  const tracking = await integrations(ctx.env).shipping.buyLabel(order);
  await ctx.env.DB.prepare('UPDATE orders SET tracking_no = ? WHERE id = ?').bind(tracking, order.id).run();
  order.tracking_no = tracking;
  await setStatus(ctx.env, order, 'shipped');
  return json(ctx, { order: order.public_no, status: order.status, tracking_no: tracking });
});
