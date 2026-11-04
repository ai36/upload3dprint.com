// FR-016, P1 «Изготовление» 3: full refund, status cancelled, email with the reason (T033).
import { body, HttpError, json, preflight } from '../_lib.ts';
import { admin } from './_auth.ts';
import { findOrder, setStatus } from '../_orders.ts';
import { integrations } from '../../_integrations/index.ts';
import { canTransition, LABELS } from '../../../src/orderStatus.ts';

export const onRequestOptions = preflight;
export const onRequestPost = admin(async (ctx) => {
  const r = await body<{ order: string; reason: string }>(ctx);
  const reason = String(r.reason ?? '').trim();
  if (!reason) throw new HttpError(400, 'A reason is required: the buyer receives it');
  const order = await findOrder(ctx.env.DB, r.order);
  if (!canTransition(order.status, 'cancelled')) throw new HttpError(409, `An order with status "${LABELS[order.status]}" cannot be cancelled`);
  await integrations(ctx.env).payments.refund(order);
  await setStatus(ctx.env, order, 'cancelled', { note: reason, data: { reason, refund_cents: order.total_cents } });
  return json(ctx, { order: order.public_no, status: order.status });
});
