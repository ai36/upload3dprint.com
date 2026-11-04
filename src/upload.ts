// Upload island: FR-001–FR-007, FR-009, FR-017, P1-1…4, NFR-001, NFR-006. All API calls go to PUBLIC_API_URL.
import { inUnits, maxScale, type Metrics, type Units } from './geometry.ts';
import { quote, type Catalog } from './pricing.ts';
import { clearDraft, loadDraft, saveDraft } from './savedDraft.ts';

const API = import.meta.env.PUBLIC_API_URL ?? '';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const drop = $<HTMLLabelElement>('drop');
const input = $<HTMLInputElement>('file');
const msg = $('message');
const panel = $('panel');
const preview = $('preview');
const units = $<HTMLSelectElement>('units');
const scale = $<HTMLInputElement>('scale');
const material = $<HTMLSelectElement>('material');
const color = $<HTMLSelectElement>('color');
const qty = $<HTMLInputElement>('qty');
const out = { size: $('size'), volume: $('volume'), price: $('price'), unit: $('unit'), days: $('days'), fit: $('fit'), upload: $('upload-state') };
const checkout = $<HTMLFormElement>('checkout');
const summary = $('summary');
const pay = $<HTMLButtonElement>('pay');
const checkoutMsg = $('checkout-message');
const manual = $<HTMLFormElement>('manual');
const manualMsg = $('manual-message');
const FIELDS = ['units', 'scale', 'material', 'color', 'qty', 'email', 'name', 'line1', 'line2', 'city', 'state', 'zip', 'country'];

let catalog: Catalog | undefined;
let raw: Metrics | undefined;
let file: File | undefined;
let uploaded: Promise<string> | undefined; // model_id
let payUrl = '';
const usd = (cents: number) => '$' + (cents / 100).toFixed(2);
function say(el: HTMLElement, text: string, error = false) {
  el.textContent = text;
  el.classList.toggle('error', error);
}

async function api<T = any>(path: string, data: unknown): Promise<T> {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? 'Something went wrong. Please try again.');
  return body;
}

const ready = fetch(API + '/api/catalog')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
  .then((c: Catalog) => {
    catalog = c;
    material.replaceChildren(...c.materials.map((m) => new Option(m.name, m.id)));
    fillColors();
    input.disabled = false;
  })
  .catch(() => say(msg, 'Pricing is unavailable right now. Please try again later.', true));

function fillColors() {
  const m = catalog!.materials.find((x) => x.id === material.value);
  color.replaceChildren(...(m?.colors ?? []).map((c) => new Option(c)));
}

const current = () => inUnits(raw!, units.value as Units, (Number(scale.value) || 100) / 100);

function update() {
  if (!catalog || !raw) return;
  const pct = Number(scale.value) || 100;
  const m = current();
  out.size.textContent = m.size.map((v) => v.toFixed(1)).join(' × ') + ' mm';
  out.volume.textContent = m.volume_cm3.toFixed(2) + ' cm³';
  const build = catalog.executor.build_mm;
  const s = maxScale(m.size, build);
  const fit = s >= 1;
  out.fit.hidden = fit;
  if (!fit) {
    const suggested = Math.floor(pct * s);
    out.fit.textContent = `The model does not fit the print area (${build.join(' × ')} mm). `;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `Scale to ${suggested}%`;
    b.onclick = () => {
      scale.value = String(suggested);
      update();
    };
    out.fit.append(b);
  }
  out.price.textContent = out.unit.textContent = out.days.textContent = '—';
  summary.hidden = pay.hidden = true;
  checkout.hidden = true;
  manual.hidden = raw.closed;
  if (!raw.closed) return say(msg, 'This mesh has holes, so its volume cannot be measured reliably. Request a manual quote below.', true);
  try {
    const q = quote(catalog, { volume_cm3: m.volume_cm3, size: m.size, material_id: material.value, color: color.value, qty: Number(qty.value) });
    out.days.textContent = `${q.days.min}–${q.days.max} business days`;
    if (fit) {
      out.price.textContent = usd(q.total_cents);
      out.unit.textContent = usd(q.unit_cents) + ' each';
      checkout.hidden = false;
    }
    say(msg, '');
  } catch (e) {
    say(msg, (e as Error).message, true);
  }
}

/** T016: after the price is shown, the file goes to private storage by the URL from upload-url. */
function upload(f: File): Promise<string> {
  say(out.upload, 'Uploading the file securely…');
  const m = current();
  const p = api('/api/upload-url', { filename: f.name, size: f.size, units: units.value, bbox: m.size, volume_cm3: m.volume_cm3 }).then(async (r) => {
    const put = await fetch(r.upload_url, { method: 'PUT', body: f });
    if (!put.ok) throw new Error('The upload failed.');
    return r.model_id as string;
  });
  p.then(
    () => say(out.upload, 'File uploaded. Only you and our team can access it.'),
    (e) => say(out.upload, `${(e as Error).message} Choose the file again to retry.`, true),
  );
  return p;
}

async function load(f: File, modelId?: string) {
  await ready;
  if (!catalog) return;
  const limit = catalog.settings.max_file_mb;
  if (f.size > limit * 1024 * 1024) return say(msg, `The file is larger than ${limit} MB.`, true);
  say(msg, 'Reading ' + f.name + '…');
  try {
    const [viewer, buffer] = await Promise.all([import('./viewer.ts'), f.arrayBuffer()]);
    const geometry = viewer.parseModel(f.name, buffer);
    raw = viewer.measure(geometry);
    file = f;
    scale.value = '100';
    panel.hidden = false;
    viewer.show(preview, geometry);
    update();
    uploaded = modelId ? Promise.resolve(modelId) : upload(f);
    uploaded.catch(() => {});
  } catch (e) {
    panel.hidden = true;
    say(msg, (e as Error).message, true);
  }
}

function item(modelId: string) {
  const m = current();
  return { model_id: modelId, material_id: material.value, color: color.value, qty: Number(qty.value), units: units.value, size: m.size, volume_cm3: m.volume_cm3 };
}
const value = (id: string) => $<HTMLInputElement>(id).value;

checkout.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!uploaded) return;
  const button = checkout.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.disabled = true;
  say(checkoutMsg, 'Calculating shipping and tax…');
  try {
    const address = { name: value('name'), line1: value('line1'), line2: value('line2'), city: value('city'), state: value('state'), zip: value('zip'), country: value('country') };
    const r = await api('/api/checkout', { email: value('email'), address, items: [item(await uploaded)] });
    $('s-items').textContent = usd(r.subtotal_cents);
    $('s-shipping').textContent = usd(r.shipping_cents);
    $('s-tax').textContent = usd(r.tax_cents);
    $('s-total').textContent = usd(r.total_cents);
    $('s-days').textContent = `${r.days.min}–${r.days.max} business days (by ${new Date(r.due_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
    pay.textContent = `Pay ${usd(r.total_cents)}`;
    payUrl = r.url;
    summary.hidden = pay.hidden = false;
    say(checkoutMsg, '');
  } catch (err) {
    say(checkoutMsg, (err as Error).message, true);
  } finally {
    button.disabled = false;
  }
});

pay.addEventListener('click', async () => {
  pay.disabled = true;
  try {
    await saveDraft({ file: file!, model_id: await uploaded!, fields: Object.fromEntries(FIELDS.map((id) => [id, value(id)])) });
  } catch {
    // Without IndexedDB the buyer re-uploads after a declined payment.
  }
  location.href = payUrl;
});

manual.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!uploaded) return;
  try {
    say(manualMsg, 'Sending…');
    await api('/api/manual-quote', { model_id: await uploaded, email: value('m-email'), note: value('m-note') });
    manual.querySelector('button')!.disabled = true;
    say(manualMsg, 'Thank you. We will review the file and email you a price.');
  } catch (err) {
    say(manualMsg, (err as Error).message, true);
  }
});

// Back from a declined payment: same model and settings (P1 «Оформить» 4).
async function restore() {
  if (!new URLSearchParams(location.search).has('restore')) return;
  history.replaceState(null, '', location.pathname);
  const d = await loadDraft().catch(() => undefined);
  if (!d) return;
  await load(d.file, d.model_id);
  for (const id of FIELDS) {
    if (d.fields[id] === undefined) continue;
    $<HTMLInputElement>(id).value = d.fields[id];
    if (id === 'material') fillColors();
  }
  update();
  say(msg, 'The payment did not go through. Your model and settings are saved, so you can try again.', true);
  await clearDraft().catch(() => {});
}
restore();

input.addEventListener('change', () => {
  if (input.files?.[0]) load(input.files[0]);
});
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files[0];
  if (f) load(f);
});
material.addEventListener('change', () => {
  fillColors();
  update();
});
for (const el of [units, scale, color, qty]) el.addEventListener('input', update);
for (const el of checkout.querySelectorAll('input, select')) el.addEventListener('input', () => (summary.hidden = pay.hidden = true));
