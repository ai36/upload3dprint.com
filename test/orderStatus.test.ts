import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTransition, canTransition, STATUSES, type Status } from '../src/orderStatus.ts';

const allowed: [Status, Status][] = [
  ['draft', 'paid'],
  ['paid', 'sent_to_executor'],
  ['sent_to_executor', 'printing'],
  ['printing', 'ready_for_pickup'],
  ['ready_for_pickup', 'shipped'],
  ['shipped', 'delivered'],
  ['paid', 'cancelled'],
  ['sent_to_executor', 'cancelled'],
  ['printing', 'cancelled'],
  ['ready_for_pickup', 'cancelled'],
];

test('T023: every allowed transition of spec §2', () => {
  for (const [a, b] of allowed) assert.ok(canTransition(a, b), `${a} → ${b}`);
  let n = 0;
  for (const a of STATUSES) for (const b of STATUSES) if (canTransition(a, b)) n++;
  assert.equal(n, allowed.length, 'no other transitions');
});

test('T023: invalid transitions throw', () => {
  for (const [a, b] of [['draft', 'shipped'], ['shipped', 'cancelled'], ['delivered', 'cancelled'], ['cancelled', 'paid'], ['printing', 'paid'], ['paid', 'printing']] as [Status, Status][])
    assert.throws(() => assertTransition(a, b), /Cannot change status/, `${a} → ${b}`);
});
