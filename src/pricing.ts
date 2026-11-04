// FR-005, FR-006, plan §2.1, §4. Shared by the browser and functions/.
import { fits, type Size } from './geometry.ts';

export interface Material {
  id: string;
  name: string;
  technology_id: string;
  price_per_cm3: number; // USD
  colors: string[];
}

export interface Catalog {
  materials: Material[];
  executor: { id: string; build_mm: Size; lead_days_min: number; lead_days_max: number };
  settings: {
    markup: number;
    min_price: number; // USD
    volume_discounts: { min_qty: number; discount: number }[];
    max_file_mb: number;
    usps_transit_days_min: number;
    usps_transit_days_max: number;
  };
}

export interface QuoteInput {
  volume_cm3: number;
  size: Size; // mm
  material_id: string;
  color: string;
  qty: number;
}

export interface Quote {
  unit_cents: number;
  total_cents: number;
  days: { min: number; max: number }; // business days
  fits: boolean;
}

/** Pickup from the contractor and packing (plan §4). */
export const HANDLING_DAYS = 1;

export function volumeDiscount(qty: number, tiers: Catalog['settings']['volume_discounts']): number {
  let discount = 0;
  for (const t of tiers) if (qty >= t.min_qty && t.discount > discount) discount = t.discount;
  return 1 - discount;
}

/** price = max(min_price, volume × price_per_cm3 × qty × volume_discount(qty)) × (1 + markup) */
export function price(volume_cm3: number, pricePerCm3: number, qty: number, s: Catalog['settings']) {
  const usd = Math.max(s.min_price, volume_cm3 * pricePerCm3 * qty * volumeDiscount(qty, s.volume_discounts)) * (1 + s.markup);
  const total_cents = Math.round(usd * 100);
  return { total_cents, unit_cents: Math.round(total_cents / qty) };
}

/** Transit defaults to the USPS days in settings; checkout passes the days of the actual rate. */
export function leadDays(c: Catalog, transit = { min: c.settings.usps_transit_days_min, max: c.settings.usps_transit_days_max }) {
  return {
    min: c.executor.lead_days_min + HANDLING_DAYS + transit.min,
    max: c.executor.lead_days_max + HANDLING_DAYS + transit.max,
  };
}

/** Date `days` business days (Mon–Fri) after `from`, as YYYY-MM-DD (UTC). */
export function addBusinessDays(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (days > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() % 6 !== 0) days--;
  }
  return d.toISOString().slice(0, 10);
}

export function quote(c: Catalog, q: QuoteInput): Quote {
  const m = c.materials.find((x) => x.id === q.material_id);
  if (!m) throw new Error('Unknown material');
  if (!m.colors.includes(q.color)) throw new Error('Unknown color');
  if (!Number.isInteger(q.qty) || q.qty < 1) throw new Error('Quantity must be a whole number ≥ 1');
  if (!(q.volume_cm3 > 0)) throw new Error('Volume must be positive');
  return { ...price(q.volume_cm3, m.price_per_cm3, q.qty, c.settings), days: leadDays(c), fits: fits(q.size, c.executor.build_mm) };
}
