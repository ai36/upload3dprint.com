// plan §2.3 email adapter: FR-012. Stub = row in `emails` + console.
import type { Env } from '../api/_lib.ts';

export interface Email {
  send(to: string, template: string, data: Record<string, unknown>): Promise<void>;
}

export function stub(env: Env): Email {
  return {
    async send(to, template, data) {
      await env.DB.prepare('INSERT INTO emails ("to", template, data, sent_at) VALUES (?, ?, ?, ?)')
        .bind(to, template, JSON.stringify(data), new Date().toISOString())
        .run();
      console.log(`[email stub] ${template} → ${to}`, JSON.stringify(data));
    },
  };
}
