import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeMeshes } from './merge.ts';

export const parse = (buffer: ArrayBuffer) => mergeMeshes(new OBJLoader().parse(new TextDecoder().decode(buffer)));
