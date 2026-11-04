import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModel, SUPPORTED } from '../src/formats/index.ts';
import { cubeStl } from './fixtures.ts';

test('T010: STL cube parses into 12 triangles', () => {
  const g = parseModel('cube.STL', cubeStl());
  assert.equal(g.getAttribute('position').count, 36);
});

test('T010: unknown extension lists supported formats', () => {
  assert.deepEqual(SUPPORTED, ['STL', 'OBJ', '3MF']);
  assert.throws(() => parseModel('model.step', new ArrayBuffer(8)), /Unsupported.*STL, OBJ, 3MF/);
});
