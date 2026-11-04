// FR-003: three.js preview with rotate/zoom. Loaded on demand to keep the page light (NFR-002).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export { parseModel } from './formats/index.ts';
export { measure } from './geometry.ts';

let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls;
let mesh: THREE.Mesh | undefined;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1e6);

scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.5));
camera.add(new THREE.DirectionalLight(0xffffff, 1.5));
scene.add(camera);

function resize(el: HTMLElement) {
  renderer!.setSize(el.clientWidth, el.clientHeight, false);
  camera.aspect = el.clientWidth / el.clientHeight;
  camera.updateProjectionMatrix();
}

export function show(el: HTMLElement, geometry: THREE.BufferGeometry) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.append(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    new ResizeObserver(() => resize(el)).observe(el);
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer!.render(scene, camera);
    });
  }
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  geometry.computeVertexNormals();
  geometry.center();
  geometry.computeBoundingSphere();
  mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x4f8cc9, roughness: 0.6 }));
  mesh.rotation.x = -Math.PI / 2; // Z-up print files -> Y-up scene
  scene.add(mesh);
  const r = geometry.boundingSphere!.radius || 1;
  camera.position.set(r * 1.6, r * 1.2, r * 2.2);
  controls.target.set(0, 0, 0);
  resize(el);
}
