import type { ShaderResource, ShaderReadback } from "./types.js";
export type ReadbackOutputs = Record<string, GPUBuffer | GPUTexture>;
export type ReadbackResult<Buffers extends boolean = false> = Buffers extends true ? GPUBuffer | Record<string, GPUBuffer> : ShaderReadback | Record<string, ShaderReadback>;
/** Copy/map is isolated from shader execution so partial failures always release staging buffers. */
export declare function readGPUOutputs<Buffers extends boolean = false>(device: GPUDevice, encoder: GPUCommandEncoder, outputs: ReadbackOutputs, resources: ShaderResource[], returnBuffers?: Buffers): Promise<ReadbackResult<Buffers>>;
