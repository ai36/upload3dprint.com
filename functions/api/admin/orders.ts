// FR-013, VIII: order list with status filter and temporary file links (T030).
import { HttpError, json, preflight } from '../_lib.ts';
import { admin } from './_auth.ts';
import { orderItems, type Order } from '../_orders.ts';
import { integrations } from '../../_integrations/index.ts';
import { isStatus } from '../../../src/orderStatus.ts';

const LINK_SECONDS = 3600;

export const onRequestOptions = preflight;
export const onRequestGet = admin(async (ctx) => {
  const status = new URL(ctx.request.url).searchParams.get('status');
  if (status && !isStatus(status)) throw new HttpError(400, 'Unknown status');
  const sql = `SELECT * FROM orders ${status ? 'WHERE status = ?' : "WHERE status <> 'draft'"} ORDER BY id DESC LIMIT 200`;
  const stmt = ctx.env.DB.prepare(sql);
  const { results } = await (status ? stmt.bind(status) : stmt).all<Order>();
  const { storage } = integrations(ctx.env);
  const orders = await Promise.all(
    results.map(async (o) => ({
      ...o,
      address: JSON.parse(o.address ?? 'null'),
      items: await Promise.all(
        (await orderItems(ctx.env.DB, o.id)).map(async ({ r2_key, bbox, ...i }) => ({
          ...i,
          size_mm: JSON.parse(bbox ?? 'null'),
          download_url: await storage.downloadUrl(r2_key, LINK_SECONDS),
        })),
      ),
    })),
  );
  return json(ctx, { orders });
});
