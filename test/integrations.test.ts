import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './d1.ts';
import { integrations } from '../functions/_integrations/index.ts';
import { US_ONLY } from '../functions/_integrations/shipping.ts';

const oregon = { name: 'Ann Lee', line1: '1120 SW 5th Ave', city: 'Portland', state: 'or', zip: '97204', country: 'US' };

test('T021: stub shipping rate by weight from settings', async () => {
  const { shipping } = integrations(env());
  assert.deepEqual(await shipping.rate({ weight_g: 200, size_mm: [250, 200, 100] }, '97204'), { cents: 600, days: { min: 2, max: 5 } });
  assert.equal((await shipping.rate({ weight_g: 1500, size_mm: [250, 200, 100] }, '97204')).cents, 1300);
  await assert.rejects(shipping.rate({ weight_g: 99999, size_mm: [1, 1, 1] }, '97204'), /too heavy/);
});

test('T021: address outside the US is refused', async () => {
  const { shipping } = integrations(env());
  await assert.rejects(shipping.validate({ ...oregon, country: 'CA', state: 'BC', zip: 'V6B 1A1' }), { message: US_ONLY });
  await assert.rejects(shipping.validate({ ...oregon, state: 'XX' }), /state/);
  await assert.rejects(shipping.validate({ ...oregon, zip: '9720' }), /ZIP/);
});

test('T021: P.O. Box is accepted', async () => {
  const a = await integrations(env()).shipping.validate({ ...oregon, line1: 'PO Box 1234' });
  assert.equal(a.line1, 'PO Box 1234');
  assert.equal(a.state, 'OR');
});

test('T021: email stub writes to `emails`', async () => {
  const e = env();
  await integrations(e).email.send('a@b.test', 'status_changed', { order: 'U1' });
  const row = await e.DB.prepare('SELECT * FROM emails').first<any>();
  assert.equal(row.to, 'a@b.test');
  assert.equal(row.template, 'status_changed');
  assert.deepEqual(JSON.parse(row.data), { order: 'U1' });
});

test('T021: tax stub uses settings rate (default 0), auth stub lets the operator in', async () => {
  const e = env();
  const i = integrations(e);
  assert.equal(await i.tax.calc(oregon as any, 10000), 0);
  await e.DB.prepare("UPDATE settings SET value = '0.05' WHERE key = 'tax_rate'").run();
  assert.equal(await i.tax.calc(oregon as any, 10000), 500);
  assert.equal(await i.auth.isOperator(new Request('http://x')), true);
});

test('T021: live adapters other than storage are not written yet', async () => {
  const i = integrations({ ...env(), INTEGRATIONS: 'live' });
  await assert.rejects(i.payments.createCheckout({ public_no: 'U1', email: 'a@b.test', total_cents: 1 }), /not implemented/);
  assert.equal(typeof i.storage.uploadUrl, 'function');
});
