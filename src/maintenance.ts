// FR-015 file retention and SC-003 due-date reminders. Called by workers/cron (T036).
import { ACTIVE, LABELS, type Status } from './orderStatus.ts';
import { addBusinessDays } from './pricing.ts';

interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface Deps {
  db: { prepare(query: string): Statement };
  settings: Record<string, any>;
  deleteFile(key: string): Promise<void>;
  sendEmail(to: string, template: string, data: Record<string, unknown>): Promise<void>;
  now: Date;
}

const DAY = 86400_000;
/** r2_key prefix of a model whose file is already deleted (T037): the row stays, the key is not deleted again. */
export const DELETED = 'deleted/';
const inList = (xs: string[]) => xs.map((x) => `'${x}'`).join(', ');
const iso = (at: string) => new Date(at.includes('T') ? at : at.replace(' ', 'T') + 'Z');

/** Delivered or cancelled: keep the file `file_retention_days` after that status (FR-015). */
export async function setRetention(d: Deps) {
  const { results } = await d.db
    .prepare(
      `SELECT oi.model_id, MAX(h.at) AS at FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN status_history h ON h.order_id = o.id AND h.status = o.status
       WHERE o.status IN ('delivered', 'cancelled') GROUP BY oi.model_id`,
    )
    .all<{ model_id: string; at: string }>();
  for (const r of results) {
    const expires = new Date(iso(r.at).getTime() + d.settings.file_retention_days * DAY).toISOString();
    await d.db.prepare('UPDATE models SET expires_at = ? WHERE id = ? AND expires_at < ?').bind(expires, r.model_id, expires).run();
  }
}

/** Deletes expired files, except models of orders in work. Returns deleted R2 keys. */
export async function deleteExpired(d: Deps): Promise<string[]> {
  const { results } = await d.db
    .prepare(
      `SELECT id, r2_key FROM models WHERE expires_at < ? AND r2_key NOT LIKE '${DELETED}%' AND id NOT IN
         (SELECT oi.model_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN (${inList(ACTIVE)}))`,
    )
    .bind(d.now.toISOString())
    .all<{ id: string; r2_key: string }>();
  for (const m of results) {
    await d.deleteFile(m.r2_key);
    // Unpaid drafts of this model cannot be paid without the file.
    const drafts = await d.db
      .prepare(`SELECT DISTINCT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.model_id = ? AND o.status = 'draft'`)
      .bind(m.id)
      .all<{ id: number }>();
    for (const { id } of drafts.results)
      for (const table of ['status_history', 'order_items']) await d.db.prepare(`DELETE FROM ${table} WHERE order_id = ?`).bind(id).run();
    for (const { id } of drafts.results) await d.db.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();
    // Keep the row of delivered and cancelled orders: it holds the settings for a reorder (P3).
    await d.db.prepare('DELETE FROM models WHERE id = ? AND id NOT IN (SELECT model_id FROM order_items)').bind(m.id).run();
    await d.db.prepare('UPDATE models SET r2_key = ? WHERE id = ?').bind(DELETED + m.r2_key, m.id).run();
  }
  return results.map((m) => m.r2_key);
}

/** Orders near the upper bound of the promise and not shipped yet: one email to the operator (SC-003). */
export async function remindDue(d: Deps): Promise<string[]> {
  const limit = addBusinessDays(d.now, d.settings.reminder_business_days ?? 1);
  const inWork = ACTIVE.filter((s) => s !== 'shipped');
  const { results } = await d.db
    .prepare(
      `SELECT public_no, status, due_date, email FROM orders
       WHERE status IN (${inList(inWork)}) AND due_date IS NOT NULL AND due_date <= ?
         AND public_no NOT IN (SELECT json_extract(data, '$.order') FROM emails WHERE template = 'due_reminder')`,
    )
    .bind(limit)
    .all<{ public_no: string; status: Status; due_date: string; email: string }>();
  for (const o of results)
    await d.sendEmail(d.settings.operator_email, 'due_reminder', { order: o.public_no, status: o.status, status_label: LABELS[o.status], due_date: o.due_date, buyer: o.email });
  return results.map((o) => o.public_no);
}

export async function runMaintenance(d: Deps) {
  await setRetention(d);
  const deleted = await deleteExpired(d);
  const reminded = await remindDue(d);
  return { deleted, reminded };
}
