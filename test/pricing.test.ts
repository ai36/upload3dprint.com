import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, volumeDiscount, type Catalog } from '../src/pricing.ts';

// Same numbers as migrations/0002_seed.sql, so T013 can compare with /api/quote.
export const catalog: Catalog = {
  materials: [{ id: 'pla', name: 'PLA', technology_id: 'fdm', price_per_cm3: 0.1, colors: ['Black', 'White', 'Gray'] }],
  executor: { id: 'contractor-1', build_mm: [220, 220, 250], lead_days_min: 2, lead_days_max: 4 },
  settings: { markup: 0.3, min_price: 5, volume_discounts: [{ min_qty: 1, discount: 0 }], max_file_mb: 100, usps_transit_days_min: 2, usps_transit_days_max: 5 },
};
const q = (volume_cm3: number, qty: number) => quote(catalog, { volume_cm3, size: [10, 10, 10], material_id: 'pla', color: 'Black', qty });

test('T012: minimum price applies to small orders', () => {
  assert.equal(q(1, 1).total_cents, 650); // max(5, 0.1) × 1.3
});

test('T012: markup and quantity', () => {
  const r = q(100, 3); // 100 × 0.1 × 3 = 30 → × 1.3 = 39
  assert.equal(r.total_cents, 3900);
  assert.equal(r.unit_cents, 1300);
});

test('T012: volume discount is 0 % (plan D-4) but the mechanism works', () => {
  assert.equal(volumeDiscount(50, catalog.settings.volume_discounts), 1);
  assert.equal(volumeDiscount(10, [{ min_qty: 1, discount: 0 }, { min_qty: 10, discount: 0.1 }]), 0.9);
});

test('T012: lead time range = lead + 1 handling + USPS transit', () => {
  assert.deepEqual(q(1, 1).days, { min: 5, max: 10 });
});

test('T012: invalid input is rejected', () => {
  assert.throws(() => quote(catalog, { volume_cm3: 1, size: [1, 1, 1], material_id: 'pla', color: 'Pink', qty: 1 }), /color/);
  assert.throws(() => q(1, 0), /Quantity/);
});
