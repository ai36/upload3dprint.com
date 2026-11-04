import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { mergeMeshes } from './merge.ts';

export const parse = (buffer: ArrayBuffer) => mergeMeshes(new ThreeMFLoader().parse(buffer));
