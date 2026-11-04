// plan §2.3 shipping adapter: FR-009, FR-010, FR-018. Stub = weight table from settings, STUB-<order> tracking.
import { HttpError, type Env } from '../api/_lib.ts';
import { getSettings } from '../api/catalog.ts';

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Parcel {
  weight_g: number;
  size_mm: [number, number, number];
}

export interface Rate {
  cents: number;
  days: { min: number; max: number }; // USPS transit, business days
}

export interface Shipping {
  validate(address: Partial<Address>): Promise<Address>;
  rate(parcel: Parcel, zip: string): Promise<Rate>;
  buyLabel(order: { public_no: string }): Promise<string>;
}

export const US_ONLY = 'We ship within the US only';

// States, DC, territories and military (APO/FPO) codes served by USPS.
const STATES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI GU AS MP AA AE AP'.split(' '),
);

export function stub(env: Env): Shipping {
  return {
    async validate(a) {
      const country = String(a.country ?? '').trim().toUpperCase();
      if (country !== 'US' && country !== 'USA') throw new HttpError(400, US_ONLY);
      const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      const address: Address = { name: t(a.name), line1: t(a.line1), line2: t(a.line2) || undefined, city: t(a.city), state: t(a.state).toUpperCase(), zip: t(a.zip), country: 'US' };
      if (!address.name || !address.line1 || !address.city) throw new HttpError(400, 'Name, street address and city are required');
      if (!STATES.has(address.state)) throw new HttpError(400, 'Enter a valid US state code, for example OR');
      if (!/^\d{5}(-\d{4})?$/.test(address.zip)) throw new HttpError(400, 'Enter a valid ZIP code, for example 97201');
      return address; // P.O. Box is fine: the carrier is USPS (spec §6)
    },
    async rate(parcel, _zip) {
      const s = await getSettings(env.DB);
      const tier = (s.shipping_rates as { max_g: number; cents: number }[]).find((r) => parcel.weight_g <= r.max_g);
      if (!tier) throw new HttpError(400, 'The parcel is too heavy for an automatic shipping rate');
      return { cents: tier.cents, days: { min: s.usps_transit_days_min, max: s.usps_transit_days_max } };
    },
    async buyLabel(order) {
      return `STUB-${order.public_no}`;
    },
  };
}
