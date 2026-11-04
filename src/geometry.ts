// FR-004, spec §6: size, volume, closed-mesh check, units, build-area fit.
import type { BufferGeometry } from 'three';

export type Units = 'mm' | 'in';
export type Size = [number, number, number];

export interface Metrics {
  size: Size; // mm
  volume_cm3: number;
  closed: boolean;
}

/** Measures a mesh in its own file units (treated as mm). */
export function measure(geometry: BufferGeometry): Metrics {
  const pos = geometry.getAttribute('position').array;
  const index = geometry.index?.array;
  const count = index ? index.length : pos.length / 3;
  const at = (i: number) => (index ? index[i] : i);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }

  // Weld vertices by position so non-indexed meshes (STL, OBJ) can be checked for holes.
  const ids = new Map<string, number>();
  const vid = (i: number) => {
    const o = at(i) * 3;
    // Integer keys (1e-4 mm grid); template strings print -0 as "0".
    const key = `${Math.round(pos[o] * 1e4)},${Math.round(pos[o + 1] * 1e4)},${Math.round(pos[o + 2] * 1e4)}`;
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    return id;
  };
  const edges = new Map<string, number>();
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  };

  let volume = 0;
  for (let t = 0; t + 2 < count; t += 3) {
    const a = at(t) * 3, b = at(t + 1) * 3, c = at(t + 2) * 3;
    // Signed volume of the tetrahedron (origin, a, b, c).
    volume +=
      (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
        pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
        pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
    const ia = vid(t), ib = vid(t + 1), ic = vid(t + 2);
    if (ia === ib || ib === ic || ic === ia) continue; // degenerate triangle
    addEdge(ia, ib);
    addEdge(ib, ic);
    addEdge(ic, ia);
  }
  let closed = edges.size > 0;
  for (const n of edges.values()) if (n !== 2) { closed = false; break; }

  return {
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    volume_cm3: Math.abs(volume) / 1000,
    closed,
  };
}

/** Converts raw metrics to mm with the chosen units and scale (1 = 100 %). */
export function inUnits(m: Metrics, units: Units, scale = 1): Metrics {
  const f = (units === 'in' ? 25.4 : 1) * scale;
  return {
    size: m.size.map((v) => v * f) as Size,
    volume_cm3: m.volume_cm3 * f ** 3,
    closed: m.closed,
  };
}

const sorted = (s: Size) => [...s].sort((a, b) => a - b);

/** Largest scale at which the model fits the build area, any axis orientation. */
export function maxScale(size: Size, build: Size): number {
  const s = sorted(size), b = sorted(build);
  return Math.min(...s.map((v, i) => (v > 0 ? b[i] / v : Infinity)));
}

export function fits(size: Size, build: Size): boolean {
  return maxScale(size, build) >= 1;
}
