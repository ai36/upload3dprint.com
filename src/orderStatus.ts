// spec §2: order states and allowed transitions (T023).
export const STATUSES = ['draft', 'paid', 'sent_to_executor', 'printing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

export const LABELS: Record<Status, string> = {
  draft: 'Draft',
  paid: 'Paid',
  sent_to_executor: 'Sent to the print shop',
  printing: 'Printing',
  ready_for_pickup: 'Ready for pickup',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled (refunded)',
};

const NEXT: Record<Status, Status[]> = {
  draft: ['paid'],
  paid: ['sent_to_executor', 'cancelled'],
  sent_to_executor: ['printing', 'cancelled'],
  printing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Orders in work: their files must be kept (FR-015). */
export const ACTIVE: Status[] = ['paid', 'sent_to_executor', 'printing', 'ready_for_pickup', 'shipped'];

export const isStatus = (s: unknown): s is Status => STATUSES.includes(s as Status);
export const canTransition = (from: Status, to: Status) => NEXT[from]?.includes(to) ?? false;

export function assertTransition(from: Status, to: Status) {
  if (!canTransition(from, to)) throw new Error(`Cannot change status from "${LABELS[from] ?? from}" to "${LABELS[to] ?? to}"`);
}
