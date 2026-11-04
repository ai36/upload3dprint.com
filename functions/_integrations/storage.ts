// plan §2.3 storage adapter: FR-002, FR-015, VIII. live = SigV4 presigned R2 URLs, stub = /api/files/<key>.
import type { Env } from '../api/_lib.ts';

export interface Storage {
  uploadUrl(key: string, size: number): Promise<string>;
  downloadUrl(key: string, expires?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

const UPLOAD_EXPIRES = 3600; // seconds
const DOWNLOAD_EXPIRES = 7 * 86400;

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
  let key = enc.encode('AWS4' + p.secretAccessKey).buffer as ArrayBuffer;
  for (const part of [day, p.region, 's3', 'aws4_request']) key = await hmac(key, part);
  return `https://${p.host}${p.path}?${qs}&X-Amz-Signature=${hex(await hmac(key, toSign))}`;
}

export function live(env: Env): Storage {
  const r2 = (method: string, key: string, expires: number, headers?: Record<string, string>) => {
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) throw new Error('R2 credentials are not configured');
    return presign({
      method,
      host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      path: `/${env.R2_BUCKET}/${key.split('/').map(uri).join('/')}`,
      region: 'auto',
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      date: new Date(),
      expires,
      headers,
    });
  };
  return {
    uploadUrl: (key, size) => r2('PUT', key, UPLOAD_EXPIRES, { 'content-length': String(size) }),
    downloadUrl: (key, expires = DOWNLOAD_EXPIRES) => r2('GET', key, expires),
    delete: (key) => env.FILES.delete(key),
  };
}

// Stub: URLs to functions/api/files/[key].ts, signed with HMAC so they stay private and temporary (VIII).
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const keyFromUrl = (segment: string) => atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
const secret = (env: Env) => enc.encode(env.R2_SECRET_ACCESS_KEY || 'stub-secret').buffer as ArrayBuffer;
export const stubSignature = async (env: Env, method: string, key: string, exp: number, size = 0) =>
  hex(await hmac(secret(env), `${method}\n${key}\n${exp}\n${size}`));

export function stub(env: Env): Storage {
  const url = async (method: string, key: string, expires: number, size?: number) => {
    const exp = Math.floor(Date.now() / 1000) + expires;
    const q = new URLSearchParams({ exp: String(exp), ...(size ? { size: String(size) } : {}), sig: await stubSignature(env, method, key, exp, size) });
    return `${env.PUBLIC_API_URL ?? ''}/api/files/${b64url(key)}?${q}`;
  };
  return {
    uploadUrl: (key, size) => url('PUT', key, UPLOAD_EXPIRES, size),
    downloadUrl: (key, expires = DOWNLOAD_EXPIRES) => url('GET', key, expires),
    delete: (key) => env.FILES.delete(key),
  };
}
