// FR-002, FR-015, VIII: size check, upload URL from the storage adapter (plan §2.3), draft row in `models`.
import { body, HttpError, json, preflight, route } from './_lib.ts';
import { getSettings } from './catalog.ts';
import { integrations } from '../_integrations/index.ts';
import type { Size, Units } from '../../src/geometry.ts';

interface UploadRequest {
  filename: string;
  size: number; // bytes
  units: Units;
  bbox?: Size;
  volume_cm3?: number;
}

export const onRequestOptions = preflight;
export const onRequestPost = route(async (ctx) => {
  const r = await body<UploadRequest>(ctx);
  const env = ctx.env;
  if (typeof r.filename !== 'string' || !r.filename) throw new HttpError(400, 'filename is required');
  if (!Number.isInteger(r.size) || r.size <= 0) throw new HttpError(400, 'size must be a positive number of bytes');
  if (r.units !== 'mm' && r.units !== 'in') throw new HttpError(400, 'units must be "mm" or "in"');
  const s = await getSettings(env.DB);
  if (r.size > s.max_file_mb * 1024 * 1024) throw new HttpError(413, `File is larger than ${s.max_file_mb} MB`);

  const id = crypto.randomUUID();
  const safe = r.filename.replace(/[^\w.-]+/g, '_').slice(-100);
  const key = `models/${id}/${safe}`;
  const url = await integrations(env).storage.uploadUrl(key, r.size);
  const expiresAt = new Date(Date.now() + s.draft_retention_days * 86400_000).toISOString();
  await env.DB.prepare('INSERT INTO models (id, r2_key, filename, units, bbox, volume_cm3, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, key, r.filename, r.units, r.bbox ? JSON.stringify(r.bbox) : null, r.volume_cm3 ?? null, expiresAt)
    .run();
  return json(ctx, { model_id: id, upload_url: url });
});
