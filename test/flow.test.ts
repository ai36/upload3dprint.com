import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, env } from './d1.ts';
import * as uploadUrl from '../functions/api/upload-url.ts';
import * as files from '../functions/api/files/[key].ts';
import * as shipping from '../functions/api/shipping.ts';
import * as checkout from '../functions/api/checkout.ts';
import * as webhook from '../functions/api/payment-webhook.ts';
import * as orders from '../functions/api/admin/orders.ts';
import * as status from '../functions/api/admin/status.ts';
import * as label from '../functions/api/admin/label.ts';
import * as cancel from '../functions/api/admin/cancel.ts';
import * as manual from '../functions/api/manual-quote.ts';
import * as manualAdmin from '../functions/api/admin/manual-quotes.ts';
import * as adminCatalog from '../functions/api/admin/catalog.ts';
import * as catalog from '../functions/api/catalog.ts';
import type { Env } from '../functions/api/_lib.ts';

const address = { name: 'Ann Lee', line1: '1120 SW 5th Ave', city: 'Portland', state: 'OR', zip: '97204', country: 'US' };
const emails = async (e: Env, template?: string) =>
  (await e.DB.prepare(`SELECT * FROM emails ${template ? 'WHERE template = ?' : ''} ORDER BY id`).bind(...(template ? [template] : [])).all<any>()).results.map((r) => ({ ...r, data: JSON.parse(r.data) }));

/** upload-url → PUT to the stub URL (T016). */
async function upload(e: Env, bytes = 1000) {
  const r = await call(uploadUrl.onRequestPost, e, 'POST', '/api/upload-url', { filename: 'cube.stl', size: bytes, units: 'mm', bbox: [20, 20, 20], volume_cm3: 8 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const u = new URL(r.body.upload_url);
  const req = new Request(u, { method: 'PUT', body: new Uint8Array(bytes), headers: { 'Content-Length': String(bytes) } });
  const put = await files.onRequestPut({ env: e, request: req, params: { key: u.pathname.split('/').pop()! } });
  return { model_id: r.body.model_id as string, url: u, put };
}

async function paidOrder(e: Env) {
  const { model_id } = await upload(e);
  const item = { model_id, material_id: 'pla', color: 'Black', qty: 2, units: 'mm', size: [20, 20, 20], volume_cm3: 8 };
  const co = await call(checkout.onRequestPost, e, 'POST', '/api/checkout', { email: 'buyer@b.test', address, items: [item] });
  assert.equal(co.status, 200, JSON.stringify(co.body));
  const session = new URL(co.body.url, 'http://site.test').searchParams.get('session');
  const pay = await call(webhook.onRequestPost, e, 'POST', '/api/payment-webhook', { type: 'paid', session_id: session });
  assert.equal(pay.body.status, 'paid');
  return co.body.order as string;
}

test('T016: stub upload stores the file, row in models; bad size and signature refused', async () => {
  const e = env();
  const { model_id, url, put } = await upload(e);
  assert.equal(put.status, 200);
  const m = await e.DB.prepare('SELECT * FROM models WHERE id = ?').bind(model_id).first<any>();
  assert.ok(e.FILES.files.has(m.r2_key));
  const key = url.pathname.split('/').pop()!;
  const wrongSize = await files.onRequestPut({ env: e, params: { key }, request: new Request(url, { method: 'PUT', body: new Uint8Array(5), headers: { 'Content-Length': '5' } }) });
  assert.equal(wrongSize.status, 400);
  url.searchParams.set('sig', '0'.repeat(64));
  const forged = await files.onRequestGet({ env: e, params: { key }, request: new Request(url) });
  assert.equal(forged.status, 403);
  const big = await call(uploadUrl.onRequestPost, e, 'POST', '/api/upload-url', { filename: 'big.stl', size: 101 * 1024 * 1024, units: 'mm' });
  assert.equal(big.status, 413);
});

test('T022: Oregon address gets a rate, Canada gets "US only"', async () => {
  const e = env();
  const items = [{ material_id: 'pla', volume_cm3: 8, qty: 2 }];
  const ok = await call(shipping.onRequestPost, e, 'POST', '/api/shipping', { address, items });
  assert.deepEqual(ok.body, { shipping_cents: 600, days: { min: 2, max: 5 }, weight_g: 170 }); // 8 × 1.24 × 2 + 150
  const ca = await call(shipping.onRequestPost, e, 'POST', '/api/shipping', { address: { ...address, country: 'CA', state: 'BC', zip: 'V6B 1A1' }, items });
  assert.deepEqual([ca.status, ca.body.error], [400, 'We ship within the US only']);
});

test('T024: checkout creates a draft with the right total', async () => {
  const e = env();
  const { model_id } = await upload(e);
  const item = { model_id, material_id: 'pla', color: 'Black', qty: 2, units: 'mm', size: [20, 20, 20], volume_cm3: 8 };
  const r = await call(checkout.onRequestPost, e, 'POST', '/api/checkout', { email: 'buyer@b.test', address, items: [item] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // items: max(5, 8 × 0.1 × 2) × 1.3 = 650; shipping 600; tax 0
  assert.equal(r.body.total_cents, 1250);
  assert.deepEqual(r.body.days, { min: 5, max: 10 });
  const o = await e.DB.prepare('SELECT * FROM orders WHERE public_no = ?').bind(r.body.order).first<any>();
  assert.deepEqual([o.status, o.total_cents, o.shipping_cents, o.tax_cents, o.due_date], ['draft', 1250, 600, 0, r.body.due_date]);
  assert.match(r.body.url, /^\/checkout-stub\/\?session=stub_/);
  const missing = await call(checkout.onRequestPost, e, 'POST', '/api/checkout', { email: 'buyer@b.test', address, items: [{ ...item, model_id: 'nope' }] });
  assert.equal(missing.status, 400);
});

test('T025: Pay → paid, history, buyer and operator emails; Decline → stays draft', async () => {
  const e = env();
  const no = await paidOrder(e);
  const o = await e.DB.prepare('SELECT * FROM orders WHERE public_no = ?').bind(no).first<any>();
  const hist = (await e.DB.prepare('SELECT status FROM status_history WHERE order_id = ?').bind(o.id).all<any>()).results.map((h) => h.status);
  assert.deepEqual(hist, ['draft', 'paid']);
  const [buyer] = await emails(e, 'order_confirmation');
  assert.equal(buyer.to, 'buyer@b.test');
  assert.equal(buyer.data.order, no);
  assert.equal(buyer.data.total_cents, 1250);
  assert.deepEqual(buyer.data.days, { min: 5, max: 10 });
  assert.equal(buyer.data.items[0].qty, 2);
  const [op] = await emails(e, 'new_order');
  assert.equal(op.to, 'operator@example.com');
  assert.match(op.data.items[0].download_url, /\/api\/files\//);
  assert.equal(op.data.address.city, 'Portland');

  const { model_id } = await upload(e);
  const co = await call(checkout.onRequestPost, e, 'POST', '/api/checkout', { email: 'b@b.test', address, items: [{ model_id, material_id: 'pla', color: 'Black', qty: 1, units: 'mm', size: [20, 20, 20], volume_cm3: 8 }] });
  const session = new URL(co.body.url, 'http://site.test').searchParams.get('session');
  const d = await call(webhook.onRequestPost, e, 'POST', '/api/payment-webhook', { type: 'declined', session_id: session });
  assert.equal(d.body.status, 'draft');
});

test('T030–T033: list, status, label, cancel', async () => {
  const e = env();
  const no = await paidOrder(e);
  const list = await call(orders.onRequestGet, e, 'GET', '/api/admin/orders?status=paid');
  assert.equal(list.body.orders.length, 1);
  assert.equal((await call(orders.onRequestGet, e, 'GET', '/api/admin/orders?status=printing')).body.orders.length, 0);
  const link = new URL(list.body.orders[0].items[0].download_url);
  const dl = await files.onRequestGet({ env: e, params: { key: link.pathname.split('/').pop()! }, request: new Request(link) });
  assert.equal(dl.status, 200);
  assert.equal((await dl.arrayBuffer()).byteLength, 1000);

  const bad = await call(status.onRequestPost, e, 'POST', '/api/admin/status', { order: no, status: 'delivered' });
  assert.equal(bad.status, 409);
  assert.equal((await call(label.onRequestPost, e, 'POST', '/api/admin/label', { order: no })).status, 409);
  for (const s of ['sent_to_executor', 'printing']) assert.equal((await call(status.onRequestPost, e, 'POST', '/api/admin/status', { order: no, status: s })).status, 200);
  assert.equal((await emails(e, 'status_changed')).length, 2);

  // Cancel from printing works; a second order is shipped and then cannot be cancelled.
  assert.equal((await call(cancel.onRequestPost, e, 'POST', '/api/admin/cancel', { order: no, reason: 'Contractor is out of PLA' })).status, 200);
  const [c] = await emails(e, 'cancelled');
  assert.equal(c.data.reason, 'Contractor is out of PLA');

  const no2 = await paidOrder(e);
  for (const s of ['sent_to_executor', 'printing', 'ready_for_pickup']) await call(status.onRequestPost, e, 'POST', '/api/admin/status', { order: no2, status: s });
  const l = await call(label.onRequestPost, e, 'POST', '/api/admin/label', { order: no2 });
  assert.deepEqual([l.status, l.body.tracking_no], [200, `STUB-${no2}`]);
  const [sh] = await emails(e, 'shipped');
  assert.equal(sh.data.tracking_no, `STUB-${no2}`);
  assert.match(sh.data.tracking_url, /usps\.com/);
  assert.equal((await call(cancel.onRequestPost, e, 'POST', '/api/admin/cancel', { order: no2, reason: 'x' })).status, 409);
});

test('T034: manual quote request reaches the operator, the reply reaches the buyer', async () => {
  const e = env();
  const { model_id } = await upload(e);
  assert.equal((await call(manual.onRequestPost, e, 'POST', '/api/manual-quote', { model_id, email: 'q@b.test', note: 'open mesh' })).status, 200);
  const [req] = await emails(e, 'manual_quote_request');
  assert.equal(req.data.email, 'q@b.test');
  const list = await call(manualAdmin.onRequestGet, e, 'GET', '/api/admin/manual-quotes');
  assert.equal(list.body.requests[0].answered_cents, null);
  assert.equal((await call(manualAdmin.onRequestPost, e, 'POST', '/api/admin/manual-quotes', { model_id, price_cents: 2500, message: 'Fixed the holes' })).status, 200);
  const [rep] = await emails(e, 'manual_quote_reply');
  assert.deepEqual([rep.to, rep.data.price_cents], ['q@b.test', 2500]);
  assert.equal((await call(manualAdmin.onRequestGet, e, 'GET', '/api/admin/manual-quotes')).body.requests[0].answered_cents, 2500);
});

test('T035: material price edited in admin changes the public catalog', async () => {
  const e = env();
  const r = await call(adminCatalog.onRequestPost, e, 'POST', '/api/admin/catalog', { kind: 'material', id: 'pla', name: 'PLA', technology_id: 'fdm', price_per_cm3: 0.2, colors: ['Black', 'Red'], active: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = await call(catalog.onRequestGet, e, 'GET', '/api/catalog');
  const pla = c.body.materials.find((m: any) => m.id === 'pla');
  assert.deepEqual([pla.price_per_cm3, pla.colors], [0.2, ['Black', 'Red']]);
  assert.equal((await call(adminCatalog.onRequestPost, e, 'POST', '/api/admin/catalog', { kind: 'setting', key: 'markup', value: 0.5 })).status, 200);
  assert.equal((await call(catalog.onRequestGet, e, 'GET', '/api/catalog')).body.settings.markup, 0.5);
});

test('T038: no download link for a deleted file, in the admin list and in the operator email', async () => {
  const e = env();
  const { model_id } = await upload(e);
  const item = { model_id, material_id: 'pla', color: 'Black', qty: 1, units: 'mm', size: [20, 20, 20], volume_cm3: 8 };
  const co = await call(checkout.onRequestPost, e, 'POST', '/api/checkout', { email: 'buyer@b.test', address, items: [item] });
  const session = new URL(co.body.url, 'http://site.test').searchParams.get('session');
  // Deleted before payment: the operator email has no link.
  await e.DB.prepare(`UPDATE models SET r2_key = 'deleted/' || r2_key WHERE id = ?`).bind(model_id).run();
  await call(webhook.onRequestPost, e, 'POST', '/api/payment-webhook', { type: 'paid', session_id: session });
  const [op] = await emails(e, 'new_order');
  assert.deepEqual([op.data.items[0].download_url, op.data.items[0].file_deleted], [null, true]);
  const it = (await call(orders.onRequestGet, e, 'GET', '/api/admin/orders')).body.orders[0].items[0];
  assert.deepEqual([it.download_url, it.file_deleted], [null, true]);
});
