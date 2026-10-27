import type { ShaderBinding, ShaderResource, TranspiledShader } from "./types.js";
/** Ignore comments without changing offsets used to rewrite WGSL declarations. */
export declare function maskComments(code: string): string;
export declare function reflectResources(code: string): ShaderResource[];
export declare function rewriteBindings(code: string, resources: ShaderResource[]): string;
export declare function compatible(a: ShaderResource, b: ShaderResource): boolean;
/** Resolve the whole set once. Previously compiled shaders are immutable. */
export declare function linkBindings(shaders: TranspiledShader[], previous?: ShaderResource[], implicit?: boolean): {
    name: string;
    group: number;
    binding: number;
    type: string;
    kind: "buffer" | "uniform" | "texture" | "storageTexture" | "sampler";
    access?: string;
    resource?: string;
    explicit?: boolean;
    fields?: {
        name: string;
        type: string;
        defaultValue?: any;
        align?: number;
        size?: number;
    }[];
    defaultUniforms?: string[];
    storageWrapper?: boolean;
}[];
export declare function rawShader(code: string, type: TranspiledShader["type"], group?: number, options?: Record<string, ShaderBinding>): TranspiledShader;
