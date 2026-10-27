import type { ShaderSource, ShaderSourceDescriptor, ShaderStage } from "./types.js";
export type ShaderStages = Partial<Record<ShaderStage, ShaderSource>> & {
    transpileString?: boolean;
};
export declare function isShaderSource(value: unknown): value is ShaderSource;
export declare function shaderDescriptor(value: ShaderSource, stage: string): ShaderSourceDescriptor;
