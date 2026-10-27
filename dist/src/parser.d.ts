import type { Param, ShaderBinding, ShaderResource, ShaderStage, TranspiledShader, WorkgroupSize } from "./types.js";
type Node = any;
export declare function parseFunction(source: string): Node;
export declare function walk(node: Node, visit: (node: Node) => void, descendFunctions?: boolean): void;
export declare function normalizeType(type: string): string;
export declare function inferType(node: Node, types?: Map<string, string>, seen?: Set<any>): string;
export declare function resourceDeclaration(r: ShaderResource): string;
export declare function compileShader(source: string, stage: ShaderStage, group: number, workGroupSize: WorkgroupSize, vbos: any[], gpuFuncs: (Function | string)[], variableTypes: any, textureOptions: any, firstBinding: number, previousParams: Param[], bindingOptions: Record<string, ShaderBinding>, builtins: any, workgroupVariables?: Record<string, string>): TranspiledShader;
export {};
