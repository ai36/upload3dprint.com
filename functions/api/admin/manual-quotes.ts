// FR-017: operator sees manual quote requests and answers with a price by e-mail (T034).
import { body, HttpError, json, preflight } from '../_lib.ts';
import { admin } from './_auth.ts';
import { integrations } from '../../_integrations/index.ts';

export const onRequestOptions = preflight;

export const onRequestGet = admin(async (ctx) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT q.data, q.sent_at, m.r2_key, m.expires_at,
       (SELECT json_extract(a.data, '$.price_cents') FROM emails a
        WHERE a.template = 'manual_quote_reply' AND json_extract(a.data, '$.model_id') = json_extract(q.data, '$.model_id')
        ORDER BY a.id DESC LIMIT 1) AS answered_cents
     FROM emails q JOIN models m ON m.id = json_extract(q.data, '$.model_id')
     WHERE q.template = 'manual_quote_request' ORDER BY q.id DESC LIMIT 100`,
  ).all<{ data: string; sent_at: string; r2_key: string; expires_at: string; answered_cents: number | null }>();
  const { storage } = integrations(ctx.env);
  const requests = await Promise.all(
    results.map(async (r) => {
      const d = JSON.parse(r.data);
      return { model_id: d.model_id, file: d.file, email: d.email, note: d.note, size_mm: d.size_mm, units: d.units, requested_at: r.sent_at, answered_cents: r.answered_cents, download_url: await storage.downloadUrl(r.r2_key, 3600) };
    }),
  );
  return json(ctx, { requests });
});

export const onRequestPost = admin(async (ctx) => {
  const r = await body<{ model_id: string; price_cents: number; message?: string }>(ctx);
  if (!Number.isInteger(r.price_cents) || r.price_cents <= 0) throw new HttpError(400, 'price_cents must be a positive whole number');
  const m = await ctx.env.DB.prepare('SELECT id, filename, email FROM models WHERE id = ?').bind(String(r.model_id ?? '')).first<{ id: string; filename: string; email: string | null }>();
  if (!m?.email) throw new HttpError(404, 'No manual quote request for this model');
  await integrations(ctx.env).email.send(m.email, 'manual_quote_reply', { model_id: m.id, file: m.filename, price_cents: r.price_cents, message: String(r.message ?? '').trim() });
  return json(ctx, { ok: true });
});
