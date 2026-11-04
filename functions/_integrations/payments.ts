// plan §2.3 payments adapter: FR-008, FR-016. Stub = /checkout-stub page with Pay / Decline.
import { HttpError, type Env } from '../api/_lib.ts';

export interface CheckoutOrder {
  public_no: string;
  email: string;
  total_cents: number;
}

export interface WebhookEvent {
  type: 'paid' | 'declined';
  session_id: string;
}

export interface Payments {
  createCheckout(order: CheckoutOrder): Promise<{ url: string; session_id: string }>;
  refund(order: { public_no: string; stripe_session_id: string | null; total_cents: number }): Promise<void>;
  parseWebhook(request: Request): Promise<WebhookEvent>;
}

export function stub(_env: Env): Payments {
  return {
    async createCheckout(order) {
      const session_id = 'stub_' + crypto.randomUUID();
      const q = new URLSearchParams({ session: session_id, order: order.public_no, total: String(order.total_cents) });
      return { url: `/checkout-stub/?${q}`, session_id };
    },
    async refund(order) {
      console.log(`[payments stub] full refund of ${order.total_cents} cents for order ${order.public_no}`);
    },
    async parseWebhook(request) {
      let e: Partial<WebhookEvent>;
      try {
        e = await request.json();
      } catch {
        throw new HttpError(400, 'Invalid JSON body');
      }
      if ((e.type !== 'paid' && e.type !== 'declined') || typeof e.session_id !== 'string') throw new HttpError(400, 'type and session_id are required');
      return { type: e.type, session_id: e.session_id };
    },
  };
}
