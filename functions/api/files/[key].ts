// plan §2.3 storage stub: PUT and GET through the FILES binding with signed, expiring URLs (FR-002, FR-015, VIII).
import { HttpError, json, preflight, route, type Context } from '../_lib.ts';
import { getSettings } from '../catalog.ts';
import { keyFromUrl, stubSignature } from '../../_integrations/storage.ts';

async function verify(ctx: Context, method: string) {
  if ((ctx.env.INTEGRATIONS ?? 'stub') !== 'stub') throw new HttpError(404, 'Not found');
  const q = new URL(ctx.request.url).searchParams;
  let key: string;
  try {
    key = keyFromUrl(String(ctx.params?.key ?? ''));
  } catch {
    throw new HttpError(404, 'Not found');
  }
  const exp = Number(q.get('exp'));
  const size = Number(q.get('size') ?? 0);
  if (!(exp > Date.now() / 1000)) throw new HttpError(403, 'The link has expired');
  if (q.get('sig') !== (await stubSignature(ctx.env, method, key, exp, size || undefined))) throw new HttpError(403, 'Invalid signature');
  return { key, size };
}

export const onRequestOptions = preflight;

export const onRequestPut = route(async (ctx) => {
  const { key, size } = await verify(ctx, 'PUT');
  const length = Number(ctx.request.headers.get('Content-Length'));
  const s = await getSettings(ctx.env.DB);
  if (!(length > 0)) throw new HttpError(411, 'Content-Length is required');
  if (length > s.max_file_mb * 1024 * 1024) throw new HttpError(413, `File is larger than ${s.max_file_mb} MB`);
  if (length !== size) throw new HttpError(400, 'File size does not match the upload link');
  const model = await ctx.env.DB.prepare('SELECT id FROM models WHERE r2_key = ?').bind(key).first();
  if (!model) throw new HttpError(404, 'Unknown upload');
  await ctx.env.FILES.put(key, await ctx.request.arrayBuffer());
  return json(ctx, { ok: true });
});

export const onRequestGet = route(async (ctx) => {
  const { key } = await verify(ctx, 'GET');
  const obj = await ctx.env.FILES.get(key);
  if (!obj) throw new HttpError(404, 'The file has been deleted');
  const name = key.split('/').pop()!;
  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' },
  });
});
