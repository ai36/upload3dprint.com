import { BufferGeometry, Float32BufferAttribute, type Object3D, type Mesh } from 'three';

/** Flattens every mesh of a loaded scene into one position-only geometry (world space). */
export function mergeMeshes(root: Object3D): BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: ArrayLike<number>[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    parts.push(g.getAttribute('position').array);
  });
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3));
}
