import type { ShaderHelper } from "./shader.js";
import type { ShaderOptions, ComputeOptions, ShaderSource, ShaderInputs, ShaderInput, StorageArray } from "./types.js";
export type ComputeChainSource = ShaderSource;
export type ComputeChainPass = {
    shader: ShaderSource;
    /** Optional shader parameter -> shared allocation name. Matching names otherwise connect implicitly. */
    resources?: Record<string, string>;
    /** Per-pass scalar/vector/matrix values; these override run() values. */
    inputs?: Record<string, ShaderInput>;
    options?: ShaderOptions & ComputeOptions;
};
export type ComputeChainStage = ComputeChainSource | ComputeChainPass;
export type ComputeChainRunOptions = {
    readback?: string | readonly string[];
    /** Optional native command encoder; caller submits it, then can read the chain. */
    commandEncoder?: GPUCommandEncoder;
};
/** Named inputs, GPU-resident intermediate buffers, and explicit final readback. */
export declare class ComputeChain {
    readonly passes: readonly ShaderHelper[];
    readonly stages: readonly ComputeChainPass[];
    private tail;
    private closing;
    private disposal?;
    get disposed(): boolean;
    private assertUsable;
    /** Stop accepting work, finish queued operations, then release this chain's helpers. */
    dispose(): Promise<void>;
    cleanup(): Promise<void>;
    private buffers;
    private inputNames;
    private passInputs;
    private sharedUniforms;
    constructor(passes: readonly ShaderHelper[], stages: readonly ComputeChainPass[]);
    private key;
    private enqueue;
    private bufferReference;
    /** With no readback option this submits all passes without mapping any GPU buffer. */
    run(inputs: ShaderInputs, options: {
        readback: string;
        commandEncoder?: GPUCommandEncoder;
    }): Promise<StorageArray>;
    run<const Names extends readonly string[]>(inputs: ShaderInputs, options: {
        readback: Names;
        commandEncoder?: GPUCommandEncoder;
    }): Promise<Record<Names[number], StorageArray>>;
    run(inputs?: ShaderInputs, options?: {
        readback?: undefined;
        commandEncoder?: GPUCommandEncoder;
    }): Promise<void>;
    run(inputs: ShaderInputs, options: ComputeChainRunOptions): Promise<void | StorageArray | Record<string, StorageArray>>;
    /** Reuse the allocation directly in another WebGPUjs helper without a CPU copy. */
    getBuffer(name: string): GPUBuffer;
    private bufferNow;
    /** Read one buffer as a typed array, or several as an object keyed by shared name. */
    read(name: string): Promise<StorageArray>;
    read<const Names extends readonly string[]>(names: Names): Promise<Record<Names[number], StorageArray>>;
    read(names: string | readonly string[]): Promise<StorageArray | Record<string, StorageArray>>;
    private readNow;
}
