import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export const parse = (buffer: ArrayBuffer) => new STLLoader().parse(buffer);
