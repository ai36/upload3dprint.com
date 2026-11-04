// FR-002, FR-015, VIII: size check, presigned R2 PUT (SigV4 on WebCrypto), draft row in `models`.
import { body, HttpError, json, preflight, route } from './_lib.ts';
import { getSettings } from './catalog.ts';
import type { Size, Units } from '../../src/geometry.ts';

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key: ArrayBuffer, msg: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}
// RFC 3986 encoding required by SigV4.
const uri = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export interface PresignInput {
  method: string;
  host: string;
  path: string; // already URI-encoded, starts with "/"
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
  expires: number; // seconds
  headers?: Record<string, string>; // signed in addition to host, lower-case names
}

/** AWS SigV4 query-string presigning for S3-compatible storage (R2). */
export async function presign(p: PresignInput): Promise<string> {
  const amzDate = p.date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${p.region}/s3/aws4_request`;
  const headers: Record<string, string> = { ...p.headers, host: p.host };
  const names = Object.keys(headers).sort();
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${p.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(p.expires),
    'X-Amz-SignedHeaders': names.join(';'),
  };
  const qs = Object.keys(query).sort().map((k) => `${uri(k)}=${uri(query[k])}`).join('&');
  const canonical = [p.method, p.path, qs, names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  let key = enc.encode("AWS4" + p.secretAccessKey).buffer as ArrayBuffer;
  for (const part of [day, p.region, 's3', 'aws4_request']) key = await hmac(key, part);
  return `https://${p.host}${p.path}?${qs}&X-Amz-Signature=${hex(await hmac(key, toSign))}`;
}

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
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) throw new Error('R2 credentials are not configured');

  const id = crypto.randomUUID();
  const safe = r.filename.replace(/[^\w.-]+/g, '_').slice(-100);
  const key = `models/${id}/${safe}`;
  const expiresIn = 3600;
  const url = await presign({
    method: 'PUT',
    host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path: `/${env.R2_BUCKET}/${key.split('/').map(uri).join('/')}`,
    region: 'auto',
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    date: new Date(),
    expires: expiresIn,
    headers: { 'content-length': String(r.size) },
  });
  const expiresAt = new Date(Date.now() + s.draft_retention_days * 86400_000).toISOString();
  await env.DB.prepare('INSERT INTO models (id, r2_key, filename, units, bbox, volume_cm3, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, key, r.filename, r.units, r.bbox ? JSON.stringify(r.bbox) : null, r.volume_cm3 ?? null, expiresAt)
    .run();
  return json(ctx, { model_id: id, upload_url: url, expires_in: expiresIn });
});
