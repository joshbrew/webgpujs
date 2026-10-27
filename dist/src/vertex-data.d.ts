import { ResourceScope } from "./lifecycle.js";
import type { BufferGroup } from "./types.js";
/** Upload interleaved geometry without reallocating unchanged buffers or leaking replacements. */
export declare function uploadGeometry(device: GPUDevice, scope: ResourceScope, group: BufferGroup, vertices: any, index: number, bufferOffset: number, dataOffset: number, stride: number, indexed?: boolean, format?: GPUIndexFormat): void;
