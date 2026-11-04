import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './d1.ts';
import { getSettings } from '../functions/api/catalog.ts';
import { integrations } from '../functions/_integrations/index.ts';
import { runMaintenance } from '../src/maintenance.ts';

const DAY = 86400_000;

test('T036: expired files are deleted, files of orders in work are kept, retention set, reminder sent once', async () => {
  const e = env();
  const now = new Date('2026-11-10T12:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * DAY).toISOString();
  const db = e.DB;
  const model = async (id: string, expires: string) => {
    await db.prepare("INSERT INTO models (id, r2_key, filename, units, expires_at) VALUES (?, ?, 'f.stl', 'mm', ?)").bind(id, `models/${id}/f.stl`, expires).run();
    await e.FILES.put(`models/${id}/f.stl`, new ArrayBuffer(1));
  };
  const order = async (no: string, status: string, modelId: string, due: string | null, statusAt = ago(1)) => {
    const o = await db.prepare("INSERT INTO orders (public_no, email, status, due_date) VALUES (?, 'b@b.test', ?, ?) RETURNING id").bind(no, status, due).first<{ id: number }>();
    await db.prepare("INSERT INTO order_items (order_id, model_id, material_id, color, qty, unit_price_cents) VALUES (?, ?, 'pla', 'Black', 1, 100)").bind(o!.id, modelId).run();
    await db.prepare('INSERT INTO status_history (order_id, status, at) VALUES (?, ?, ?)').bind(o!.id, status, statusAt).run();
  };
  await model('draft', ago(1)); // expired draft file, with an unpaid draft order
  await order('UDRAFT', 'draft', 'draft', null);
  await model('loose', ago(1)); // expired, never ordered
  await model('work', ago(1)); // expired draft date, but the order is in work
  await order('UWORK', 'printing', 'work', '2026-11-11');
  await model('done', ago(1)); // delivered 40 days ago → expired
  await order('UDONE', 'delivered', 'done', null, ago(40));
  await model('recent', ago(1)); // delivered 5 days ago → kept 30 days
  await order('URECENT', 'delivered', 'recent', null, ago(5));

  const { storage, email } = integrations(e);
  const deps = { db, settings: await getSettings(db), deleteFile: (k: string) => storage.delete(k), sendEmail: email.send, now };
  const r = await runMaintenance(deps);

  assert.deepEqual([...e.FILES.files.keys()].sort(), ['models/recent/f.stl', 'models/work/f.stl']);
  assert.deepEqual(r.deleted.sort(), ['models/done/f.stl', 'models/draft/f.stl', 'models/loose/f.stl']);
  assert.equal(await db.prepare("SELECT 1 FROM orders WHERE public_no = 'UDRAFT'").first(), null);
  assert.equal(await db.prepare("SELECT 1 FROM models WHERE id IN ('draft', 'loose')").first(), null);
  const recent = await db.prepare("SELECT expires_at FROM models WHERE id = 'recent'").first<any>();
  assert.equal(recent.expires_at, new Date(now.getTime() + 25 * DAY).toISOString());

  assert.deepEqual(r.reminded, ['UWORK']);
  assert.deepEqual((await runMaintenance(deps)).reminded, [], 'one reminder per order');
  const rem = await db.prepare("SELECT * FROM emails WHERE template = 'due_reminder'").first<any>();
  assert.equal(rem.to, 'operator@example.com');
});

test('T037: a deleted file is marked and not deleted again on the next run', async () => {
  const e = env();
  const now = new Date('2026-11-10T12:00:00Z');
  const db = e.DB;
  await db.prepare("INSERT INTO models (id, r2_key, filename, units, expires_at) VALUES ('done', 'models/done/f.stl', 'f.stl', 'mm', ?)").bind(new Date(now.getTime() - 40 * DAY).toISOString()).run();
  await e.FILES.put('models/done/f.stl', new ArrayBuffer(1));
  const o = await db.prepare("INSERT INTO orders (public_no, email, status) VALUES ('UDONE', 'b@b.test', 'delivered') RETURNING id").first<{ id: number }>();
  await db.prepare("INSERT INTO order_items (order_id, model_id, material_id, color, qty, unit_price_cents) VALUES (?, 'done', 'pla', 'Black', 1, 100)").bind(o!.id).run();
  await db.prepare("INSERT INTO status_history (order_id, status, at) VALUES (?, 'delivered', ?)").bind(o!.id, new Date(now.getTime() - 40 * DAY).toISOString()).run();

  const calls: string[] = [];
  const deps = { db, settings: await getSettings(db), deleteFile: async (k: string) => void calls.push(k), sendEmail: async () => {}, now };
  assert.deepEqual((await runMaintenance(deps)).deleted, ['models/done/f.stl']);
  assert.deepEqual((await runMaintenance(deps)).deleted, [], 'second run deletes nothing');
  assert.deepEqual(calls, ['models/done/f.stl']);
  const m = await db.prepare("SELECT r2_key FROM models WHERE id = 'done'").first<any>();
  assert.equal(m.r2_key, 'deleted/models/done/f.stl', 'row kept for a reorder (P3), marked as deleted');
});
