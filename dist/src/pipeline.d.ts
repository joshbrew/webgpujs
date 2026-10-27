import { type ShaderStages } from "./shader-source.js";
import { ShaderHelper } from "./shader.js";
import { ComputeChain, type ComputeChainStage } from "./compute-chain.js";
import type { ShaderOptions, ComputeOptions, ShaderStage, ShaderSource, TranspiledShader, PipelineOptions } from "./types.js";
export type ShaderSources = ShaderSource | ShaderStages;
type Options = PipelineOptions;
export declare class WebGPUjs {
    static device: GPUDevice;
    private static defaultDevicePromise?;
    private static defaultDevice;
    /** Connect compute passes by parameter name, with optional explicit resource aliases. */
    static createComputeChain(stages: ComputeChainStage[], options?: ShaderOptions & ComputeOptions): Promise<ComputeChain>;
    static createPipeline: (sources: ShaderSources, options?: Options) => Promise<ShaderHelper>;
    static init: (shaders: Partial<Record<ShaderStage, TranspiledShader>>, options?: Options) => ShaderHelper;
    /** Share allocations with an earlier helper without changing its compiled layouts or parameter order. */
    static combineShaders: (shaders: ShaderSources, options: Options, previousPipeline: ShaderHelper) => Promise<ShaderHelper>;
    static dispose: (pipeline: ShaderHelper | ComputeChain) => void | Promise<void>;
    /** Compatibility alias for dispose(). Does not destroy the GPUDevice. */
    static cleanup: (pipeline: ShaderHelper | ComputeChain) => void | Promise<void>;
}
export default WebGPUjs;
