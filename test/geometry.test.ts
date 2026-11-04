import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModel } from '../src/formats/index.ts';
import { measure, inUnits, fits, maxScale } from '../src/geometry.ts';
import { cubeStl } from './fixtures.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('T011: 10 mm cube is 1 cm³ and 10×10×10, closed', () => {
  const m = measure(parseModel('c.stl', cubeStl(10)));
  near(m.volume_cm3, 1);
  assert.deepEqual(m.size, [10, 10, 10]);
  assert.equal(m.closed, true);
});

test('T011: inches multiply sizes by 25.4', () => {
  const m = inUnits(measure(parseModel('c.stl', cubeStl(1))), 'in');
  m.size.forEach((v) => near(v, 25.4));
  near(m.volume_cm3, 25.4 ** 3 / 1000);
});

test('T011: open mesh is detected', () => {
  assert.equal(measure(parseModel('c.stl', cubeStl(10, 1))).closed, false);
});

test('FR-004: build-area fit and suggested scale', () => {
  assert.equal(fits([250, 10, 10], [220, 220, 250]), true); // rotated onto Z
  assert.equal(fits([300, 10, 10], [220, 220, 250]), false);
  near(maxScale([300, 10, 10], [220, 220, 250]), 250 / 300);
});
