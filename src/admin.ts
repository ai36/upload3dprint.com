// Operator page (T035): orders, status, label, cancel, manual quotes, catalog. FR-005, FR-007, FR-013, FR-016–FR-018.
import { canTransition, LABELS, STATUSES, type Status } from './orderStatus.ts';

const API = import.meta.env.PUBLIC_API_URL ?? '';
const $ = (id: string) => document.getElementById(id)!;
const usd = (cents: number) => '$' + (cents / 100).toFixed(2);
const say = (text: string, error = false) => {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
};

async function api(path: string, data?: unknown) {
  const r = await fetch(API + path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}
const button = (text: string, action: () => Promise<unknown>) =>
  el('button', {
    type: 'button',
    textContent: text,
    onclick: () =>
      action()
        .then(() => say(`${text}: done`))
        .then(refresh)
        .catch((e) => say(e.message, true)),
  });
const input = (value: unknown, size = 8) => el('input', { value: String(value ?? ''), size });
const label = (text: string, e: HTMLElement) => el('label', {}, text, e);

async function orders() {
  const status = ($('filter') as HTMLSelectElement).value;
  const { orders } = await api('/api/admin/orders' + (status ? `?status=${status}` : ''));
  $('orders').replaceChildren(
    ...(orders.length ? [] : [el('p', { className: 'note', textContent: 'No orders.' })]),
    ...orders.map((o: any) => {
      const a = o.address ?? {};
      // Shipped comes from the label purchase, cancelled from the refund.
      const next = STATUSES.filter((s) => canTransition(o.status, s) && s !== 'shipped' && s !== 'cancelled');
      const select = el('select', {}, ...next.map((s) => new Option(LABELS[s], s)));
      const actions = el('div', { className: 'row' });
      if (next.length) actions.append(select, button('Set status', () => api('/api/admin/status', { order: o.public_no, status: select.value })));
      if (canTransition(o.status, 'shipped')) actions.append(button('Buy USPS label', () => api('/api/admin/label', { order: o.public_no })));
      if (canTransition(o.status, 'cancelled'))
        actions.append(
          button('Cancel and refund', async () => {
            const reason = prompt('Reason for the buyer:');
            if (!reason) throw new Error('Not cancelled: a reason is required');
            return api('/api/admin/cancel', { order: o.public_no, reason });
          }),
        );
      return el(
        'div',
        { className: 'card' },
        el('strong', { textContent: `${o.public_no} · ${LABELS[o.status as Status]} · ${usd(o.total_cents)} · due ${o.due_date ?? '—'}` }),
        el('span', { textContent: `${o.email} · ${[a.name, a.line1, a.line2, a.city, a.state, a.zip].filter(Boolean).join(', ')}` + (o.tracking_no ? ` · tracking ${o.tracking_no}` : '') }),
        ...o.items.map((i: any) =>
          el(
            'div',
            { className: 'row' },
            el('a', { href: i.download_url, textContent: i.filename }),
            `${i.material}, ${i.color}, × ${i.qty}, ${(i.size_mm ?? []).map((v: number) => v.toFixed(1)).join(' × ')} mm, ${Number(i.volume_cm3).toFixed(2)} cm³, ${usd(i.unit_price_cents)} each`,
          ),
        ),
        actions,
      );
    }),
  );
}

async function quotes() {
  const { requests } = await api('/api/admin/manual-quotes');
  $('quotes').replaceChildren(
    ...(requests.length ? [] : [el('p', { className: 'note', textContent: 'No requests.' })]),
    ...requests.map((q: any) => {
      const price = el('input', { type: 'number', min: '0.01', step: '0.01', placeholder: 'Price, $' });
      const text = el('input', { placeholder: 'Message', size: 40 });
      return el(
        'div',
        { className: 'card' },
        el('div', { className: 'row' }, el('a', { href: q.download_url, textContent: q.file }), `${q.email} · ${q.requested_at.slice(0, 10)}`, q.answered_cents ? `answered: ${usd(q.answered_cents)}` : 'not answered'),
        q.note ? el('span', { className: 'note', textContent: q.note }) : '',
        el('div', { className: 'row' }, price, text, button('Send price', () => api('/api/admin/manual-quotes', { model_id: q.model_id, price_cents: Math.round(Number(price.value) * 100), message: text.value }))),
      );
    }),
  );
}

function materialRow(m: any) {
  const f = { id: input(m.id), name: input(m.name), technology_id: input(m.technology_id ?? 'fdm', 5), price: input(m.price_per_cm3, 6), colors: input((m.colors ?? []).join(', '), 30), active: el('input', { type: 'checkbox', checked: m.active !== 0 }) };
  return el(
    'div',
    { className: 'card row' },
    label('ID', f.id), label('Name', f.name), label('Technology', f.technology_id), label('$ per cm³', f.price), label('Colors, comma-separated', f.colors), label('Active', f.active),
    button('Save', () =>
      api('/api/admin/catalog', {
        kind: 'material', id: f.id.value, name: f.name.value, technology_id: f.technology_id.value, price_per_cm3: Number(f.price.value),
        colors: f.colors.value.split(',').map((c) => c.trim()).filter(Boolean), active: f.active.checked,
      }),
    ),
  );
}

const EXECUTOR_FIELDS = ['name', 'build_x_mm', 'build_y_mm', 'build_z_mm', 'lead_days_min', 'lead_days_max', 'pickup_address'];

async function catalog() {
  const c = await api('/api/admin/catalog');
  $('materials').replaceChildren(...c.materials.map(materialRow));
  $('executors').replaceChildren(
    ...c.executors.map((x: any) => {
      const f = Object.fromEntries(EXECUTOR_FIELDS.map((k) => [k, input(x[k], k === 'name' || k === 'pickup_address' ? 24 : 5)]));
      const techs = input(x.technology_ids.join(', '), 10);
      const active = el('input', { type: 'checkbox', checked: x.active !== 0 });
      return el(
        'div',
        { className: 'card row' },
        el('strong', { textContent: x.id }),
        ...EXECUTOR_FIELDS.map((k) => label(k, f[k])),
        label('technologies', techs),
        label('active', active),
        button('Save', () =>
          api('/api/admin/catalog', {
            kind: 'executor', id: x.id, ...Object.fromEntries(EXECUTOR_FIELDS.map((k) => [k, f[k].value])),
            technology_ids: techs.value.split(',').map((t) => t.trim()).filter(Boolean), active: active.checked,
          }),
        ),
      );
    }),
  );
  $('settings').replaceChildren(
    el(
      'table',
      {},
      ...Object.entries(c.settings).map(([key, value]) => {
        const t = el('textarea', { rows: 1, value: JSON.stringify(value) });
        return el('tr', {}, el('td', { textContent: key }), el('td', {}, t), el('td', {}, button('Save', async () => api('/api/admin/catalog', { kind: 'setting', key, value: JSON.parse(t.value) }))));
      }),
    ),
  );
}

async function refresh() {
  try {
    await Promise.all([orders(), quotes(), catalog()]);
  } catch (e) {
    say((e as Error).message, true);
  }
}

$('filter').addEventListener('change', () => orders().catch((e) => say(e.message, true)));
$('add-material').addEventListener('click', () => $('materials').append(materialRow({ colors: [] })));
refresh();
