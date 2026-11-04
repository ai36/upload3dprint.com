// Upload island: FR-001–FR-007, P1-1…4, NFR-001, NFR-006. All API calls go to PUBLIC_API_URL.
import { inUnits, maxScale, type Metrics, type Units } from './geometry.ts';
import { quote, type Catalog } from './pricing.ts';

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
const out = { size: $('size'), volume: $('volume'), price: $('price'), unit: $('unit'), days: $('days'), fit: $('fit') };

let catalog: Catalog | undefined;
let raw: Metrics | undefined;
const usd = (cents: number) => '$' + (cents / 100).toFixed(2);
function say(text: string, error = false) {
  msg.textContent = text;
  msg.classList.toggle('error', error);
}

const ready = fetch(API + '/api/catalog')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
  .then((c: Catalog) => {
    catalog = c;
    material.replaceChildren(...c.materials.map((m) => new Option(m.name, m.id)));
    fillColors();
    input.disabled = false;
  })
  .catch(() => say('Pricing is unavailable right now. Please try again later.', true));

function fillColors() {
  const m = catalog!.materials.find((x) => x.id === material.value);
  color.replaceChildren(...(m?.colors ?? []).map((c) => new Option(c)));
}

function update() {
  if (!catalog || !raw) return;
  const pct = Number(scale.value) || 100;
  const m = inUnits(raw, units.value as Units, pct / 100);
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
  if (!raw.closed) return say('This mesh has holes, so its volume cannot be measured reliably. It needs a manual quote.', true);
  try {
    const q = quote(catalog, { volume_cm3: m.volume_cm3, size: m.size, material_id: material.value, color: color.value, qty: Number(qty.value) });
    out.days.textContent = `${q.days.min}–${q.days.max} business days`;
    if (fit) {
      out.price.textContent = usd(q.total_cents);
      out.unit.textContent = usd(q.unit_cents) + ' each';
    }
    say('');
  } catch (e) {
    say((e as Error).message, true);
  }
}

async function load(file: File) {
  await ready;
  if (!catalog) return;
  const limit = catalog.settings.max_file_mb;
  if (file.size > limit * 1024 * 1024) return say(`The file is larger than ${limit} MB.`, true);
  say('Reading ' + file.name + '…');
  try {
    const [viewer, buffer] = await Promise.all([import('./viewer.ts'), file.arrayBuffer()]);
    const geometry = viewer.parseModel(file.name, buffer);
    raw = viewer.measure(geometry);
    scale.value = '100';
    panel.hidden = false;
    viewer.show(preview, geometry);
    update();
  } catch (e) {
    panel.hidden = true;
    say((e as Error).message, true);
  }
}

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
