// Test-only D1 and R2 stand-ins: node:sqlite with the real migrations, a Map for files.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import type { Env, R2Bucket } from '../functions/api/_lib.ts';

const dir = new URL('../migrations/', import.meta.url);

export function d1(): Env['DB'] {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind: (...v: unknown[]) => ((args = v), stmt),
        all: async () => ({ results: db.prepare(sql).all(...(args as any[])) as any[] }),
        first: async () => (db.prepare(sql).get(...(args as any[])) as any) ?? null,
        run: async () => db.prepare(sql).run(...(args as any[])),
      };
      return stmt;
    },
  };
}

export function r2(): R2Bucket & { files: Map<string, ArrayBuffer> } {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    async put(key, value) {
      files.set(key, value instanceof ArrayBuffer ? value : await new Response(value).arrayBuffer());
    },
    async get(key) {
      const b = files.get(key);
      return b ? { body: new Response(b).body!, size: b.byteLength } : null;
    },
    async head(key) {
      const b = files.get(key);
      return b ? { size: b.byteLength } : null;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}

export const env = (): Env & { FILES: ReturnType<typeof r2> } => ({ DB: d1(), FILES: r2(), APP_ORIGINS: '', PUBLIC_API_URL: 'http://api.test', INTEGRATIONS: 'stub' });

export const call = async (handler: (ctx: any) => Promise<Response>, e: Env, method: string, path: string, data?: unknown, init: RequestInit = {}) => {
  const res = await handler({ env: e, request: new Request('http://api.test' + path, { method, body: data === undefined ? undefined : JSON.stringify(data), ...init }), params: {} });
  return { status: res.status, body: res.headers.get('Content-Type')?.includes('json') ? await res.json() : await res.text() };
};
