// plan §2.0, NFR-006: JSON responses, errors and CORS for every /api function.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface Env {
  DB: { prepare(query: string): D1Statement };
  APP_ORIGINS: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
}

export interface Context {
  request: Request;
  env: Env;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function corsHeaders(ctx: Context): Record<string, string> {
  const origin = ctx.request.headers.get('Origin');
  const allowed = ctx.env.APP_ORIGINS.split(',').map((o) => o.trim());
  if (!origin || !allowed.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(ctx: Context, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(ctx) },
  });
}

export const error = (ctx: Context, status: number, message: string) => json(ctx, { error: message }, status);

export const preflight = (ctx: Context) => new Response(null, { status: 204, headers: corsHeaders(ctx) });

/** Wraps a handler: HttpError → its status, anything else → 500. */
export function route(fn: (ctx: Context) => Promise<Response>) {
  return async (ctx: Context) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof HttpError) return error(ctx, e.status, e.message);
      console.error(e);
      return error(ctx, 500, 'Internal error');
    }
  };
}

export async function body<T>(ctx: Context): Promise<T> {
  try {
    return (await ctx.request.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}
