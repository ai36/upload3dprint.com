// FR-001, NFR-005, plan §2.1: extension → parser. New format = new file + one line here.
import type { BufferGeometry } from 'three';
import * as stl from './stl.ts';
import * as obj from './obj.ts';
import * as tmf from './3mf.ts';

const handlers: Record<string, (buffer: ArrayBuffer) => BufferGeometry> = {
  stl: stl.parse,
  obj: obj.parse,
  '3mf': tmf.parse,
};

export const SUPPORTED = Object.keys(handlers).map((e) => e.toUpperCase());
const list = () => `Supported formats: ${SUPPORTED.join(', ')}.`;

export function parseModel(filename: string, buffer: ArrayBuffer): BufferGeometry {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const handler = handlers[ext];
  if (!handler) throw new Error(`Unsupported file type "${ext ? '.' + ext : filename}". ${list()}`);
  let geometry: BufferGeometry;
  try {
    geometry = handler(buffer);
  } catch {
    throw new Error(`The file could not be read. It may be damaged. ${list()}`);
  }
  if (!geometry.getAttribute('position')?.count) throw new Error(`The file contains no 3D mesh. ${list()}`);
  return geometry;
}
