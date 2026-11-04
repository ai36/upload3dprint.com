// FR-017, spec §6: model that cannot be priced automatically → file + e-mail → operator (T034).
import { body, HttpError, json, preflight, route } from './_lib.ts';
import { getSettings } from './catalog.ts';
import { integrations } from '../_integrations/index.ts';

export const onRequestOptions = preflight;
export const onRequestPost = route(async (ctx) => {
  const r = await body<{ model_id: string; email: string; note?: string }>(ctx);
  const env = ctx.env;
  const email = String(r.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid e-mail');
  const model = await env.DB.prepare('SELECT id, r2_key, filename, units, bbox FROM models WHERE id = ?')
    .bind(String(r.model_id ?? ''))
    .first<{ id: string; r2_key: string; filename: string; units: string; bbox: string | null }>();
  if (!model || !(await env.FILES.head(model.r2_key))) throw new HttpError(400, 'The model file has not been uploaded');
  await env.DB.prepare('UPDATE models SET email = ? WHERE id = ?').bind(email, model.id).run();
  const { email: mail, storage } = integrations(env);
  await mail.send((await getSettings(env.DB)).operator_email, 'manual_quote_request', {
    model_id: model.id,
    file: model.filename,
    download_url: await storage.downloadUrl(model.r2_key),
    email,
    units: model.units,
    size_mm: JSON.parse(model.bbox ?? 'null'),
    note: String(r.note ?? '').trim().slice(0, 2000),
  });
  return json(ctx, { ok: true });
});
