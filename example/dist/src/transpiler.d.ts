import { TranspiledShader } from "./types";
export declare class WGSLTranspiler {
    static builtInUniforms: {
        resX: {
            type: string;
            callback: (shaderContext: any) => any;
        };
        resY: {
            type: string;
            callback: (shaderContext: any) => any;
        };
        mouseX: {
            type: string;
            callback: (shaderContext: any) => any;
        };
        mouseY: {
            type: string;
            callback: (shaderContext: any) => any;
        };
        clicked: {
            type: string;
            callback: (shaderContext: any) => any;
        };
        frame: {
            type: string;
            callback: (shaderContext: any) => any;
        };
        utcTime: {
            type: string;
            callback: (shaderContext: any) => number;
        };
    };
    static getFunctionHead: (methodString: any) => any;
    static splitIgnoringBrackets: (str: any) => any[];
    static tokenize(funcStr: any): {
        token: any;
        isInput: boolean;
    }[];
    static excludedNames: {
        color: boolean;
        position: boolean;
        uv: boolean;
        normal: boolean;
        pixel: boolean;
    };
    static parse: (fstr: any, tokens: any, shaderType?: string) => any[];
    static inferTypeFromValue(value: any, funcStr: any, ast: any, defaultValue?: any): any;
    static flattenStrings(arr: any): any;
    static generateDataStructures(funcStr: any, ast: any, bindGroup?: number): {
        code: string;
        params: any[];
        defaultUniforms: any;
    };
    static extractAndTransposeInnerFunctions: (body: any, extract: boolean, ast: any, params: any, shaderType: any) => {
        body: any;
        extractedFunctions: string;
    };
    static generateMainFunctionWorkGroup(funcStr: string, ast: any, params: any, shaderType: string, nVertexBuffers: number, workGroupSize: number, gpuFuncs: (Function | string)[]): string;
    static transposeBody: (body: any, funcStr: any, params: any, shaderType: any, returns?: boolean, shaderHead?: string, extractConsts?: boolean) => {
        code: string;
        consts: any;
    };
    static indentCode(code: any): string;
    static addFunction: (func: any, shaders: any) => any;
    static combineBindings(bindings1str: string, bindings2str: string): {
        code1: string;
        changes1: any;
        code2: string;
        changes2: any;
    };
    static combineShaderParams(shader1Obj: TranspiledShader, shader2Obj: TranspiledShader): void;
    static convertToWebGPU(func: Function | string, shaderType?: 'compute' | 'vertex' | 'fragment', bindGroupNumber?: number, nVertexBuffers?: number, workGroupSize?: number, gpuFuncs?: (Function | string)[]): TranspiledShader;
}
export declare const replacements: {
    'Math.PI': string;
    'Math.E': string;
    'Math.abs': string;
    'Math.acos': string;
    'Math.asin': string;
    'Math.atan': string;
    'Math.atan2': string;
    'Math.ceil': string;
    'Math.cos': string;
    'Math.exp': string;
    'Math.floor': string;
    'Math.log': string;
    'Math.max': string;
    'Math.min': string;
    'Math.pow': string;
    'Math.round': string;
    'Math.sin': string;
    'Math.sqrt': string;
    'Math.tan': string;
};
export declare const textureFormats: {
    r: {
        "8unorm": string;
        "16float": string;
        "32float": string;
    };
    rg: {
        "8unorm": string;
        "16float": string;
        "32float": string;
    };
    rgba: {
        "8unorm": string;
        "8unorm-srgb": string;
        "10a2unorm": string;
        "16float": string;
        "32float": string;
    };
    bgra: {
        "8unorm": string;
        "8unorm-srgb": string;
    };
};
export declare const imageToTextureFormats: {
    ".png": string[];
    ".jpg": string[];
    ".hdr": string[];
    ".exr": string[];
};
export declare const WGSLTypeSizes: {
    i16: {
        alignment: number;
        size: number;
    };
    u16: {
        alignment: number;
        size: number;
    };
    f16: {
        alignment: number;
        size: number;
    };
    'vec2<f16>': {
        alignment: number;
        size: number;
    };
    'vec2<i16>': {
        alignment: number;
        size: number;
    };
    'vec2<u16>': {
        alignment: number;
        size: number;
    };
    'vec3<f16>': {
        alignment: number;
        size: number;
    };
    'vec3<i16>': {
        alignment: number;
        size: number;
    };
    'vec3<u16>': {
        alignment: number;
        size: number;
    };
    'vec4<f16>': {
        alignment: number;
        size: number;
    };
    'vec4<i16>': {
        alignment: number;
        size: number;
    };
    'vec4<u16>': {
        alignment: number;
        size: number;
    };
    'mat2x2<f16>': {
        alignment: number;
        size: number;
    };
    'mat2x2<i16>': {
        alignment: number;
        size: number;
    };
    'mat2x2<u16>': {
        alignment: number;
        size: number;
    };
    'mat3x2<f16>': {
        alignment: number;
        size: number;
    };
    'mat3x2<i16>': {
        alignment: number;
        size: number;
    };
    'mat3x2<u16>': {
        alignment: number;
        size: number;
    };
    'mat4x2<f16>': {
        alignment: number;
        size: number;
    };
    'mat4x2<i16>': {
        alignment: number;
        size: number;
    };
    'mat4x2<u16>': {
        alignment: number;
        size: number;
    };
    'mat2x3<f16>': {
        alignment: number;
        size: number;
    };
    'mat2x3<i16>': {
        alignment: number;
        size: number;
    };
    'mat2x3<u16>': {
        alignment: number;
        size: number;
    };
    'mat3x3<f16>': {
        alignment: number;
        size: number;
    };
    'mat3x3<i16>': {
        alignment: number;
        size: number;
    };
    'mat3x3<u16>': {
        alignment: number;
        size: number;
    };
    'mat4x3<f16>': {
        alignment: number;
        size: number;
    };
    'mat4x3<i16>': {
        alignment: number;
        size: number;
    };
    'mat4x3<u16>': {
        alignment: number;
        size: number;
    };
    'mat2x4<f16>': {
        alignment: number;
        size: number;
    };
    'mat2x4<i16>': {
        alignment: number;
        size: number;
    };
    'mat2x4<u16>': {
        alignment: number;
        size: number;
    };
    'mat3x4<f16>': {
        alignment: number;
        size: number;
    };
    'mat3x4<i16>': {
        alignment: number;
        size: number;
    };
    'mat3x4<u16>': {
        alignment: number;
        size: number;
    };
    'mat4x4<f16>': {
        alignment: number;
        size: number;
    };
    'mat4x4<i16>': {
        alignment: number;
        size: number;
    };
    'mat4x4<u16>': {
        alignment: number;
        size: number;
    };
} & {
    bool: {
        alignment: number;
        size: number;
    };
    u8: {
        alignment: number;
        size: number;
    };
    i8: {
        alignment: number;
        size: number;
    };
    i32: {
        alignment: number;
        size: number;
    };
    u32: {
        alignment: number;
        size: number;
    };
    f32: {
        alignment: number;
        size: number;
    };
    i64: {
        alignment: number;
        size: number;
    };
    u64: {
        alignment: number;
        size: number;
    };
    f64: {
        alignment: number;
        size: number;
    };
    atomic: {
        alignment: number;
        size: number;
    };
    'vec2<f32>': {
        alignment: number;
        size: number;
    };
    vec2f: {
        alignment: number;
        size: number;
    };
    'vec2<i32>': {
        alignment: number;
        size: number;
    };
    'vec2<u32>': {
        alignment: number;
        size: number;
    };
    'vec3<f32>': {
        alignment: number;
        size: number;
    };
    vec3f: {
        alignment: number;
        size: number;
    };
    'vec3<i32>': {
        alignment: number;
        size: number;
    };
    'vec3<u32>': {
        alignment: number;
        size: number;
    };
    'vec4<f32>': {
        alignment: number;
        size: number;
    };
    vec4f: {
        alignment: number;
        size: number;
    };
    'vec4<i32>': {
        alignment: number;
        size: number;
    };
    'vec4<u32>': {
        alignment: number;
        size: number;
    };
    'mat2x2<f32>': {
        alignment: number;
        size: number;
    };
    'mat2x2<i32>': {
        alignment: number;
        size: number;
    };
    'mat2x2<u32>': {
        alignment: number;
        size: number;
    };
    'mat3x2<f32>': {
        alignment: number;
        size: number;
    };
    'mat3x2<i32>': {
        alignment: number;
        size: number;
    };
    'mat3x2<u32>': {
        alignment: number;
        size: number;
    };
    'mat4x2<f32>': {
        alignment: number;
        size: number;
    };
    'mat4x2<i32>': {
        alignment: number;
        size: number;
    };
    'mat4x2<u32>': {
        alignment: number;
        size: number;
    };
    'mat2x3<f32>': {
        alignment: number;
        size: number;
    };
    'mat2x3<i32>': {
        alignment: number;
        size: number;
    };
    'mat2x3<u32>': {
        alignment: number;
        size: number;
    };
    'mat3x3<f32>': {
        alignment: number;
        size: number;
    };
    'mat3x3<i32>': {
        alignment: number;
        size: number;
    };
    'mat3x3<u32>': {
        alignment: number;
        size: number;
    };
    'mat4x3<f32>': {
        alignment: number;
        size: number;
    };
    'mat4x3<i32>': {
        alignment: number;
        size: number;
    };
    'mat4x3<u32>': {
        alignment: number;
        size: number;
    };
    'mat2x4<f32>': {
        alignment: number;
        size: number;
    };
    'mat2x4<i32>': {
        alignment: number;
        size: number;
    };
    'mat2x4<u32>': {
        alignment: number;
        size: number;
    };
    'mat3x4<f32>': {
        alignment: number;
        size: number;
    };
    'mat3x4<i32>': {
        alignment: number;
        size: number;
    };
    'mat3x4<u32>': {
        alignment: number;
        size: number;
    };
    'mat4x4<f32>': {
        alignment: number;
        size: number;
    };
    'mat4x4<i32>': {
        alignment: number;
        size: number;
    };
    'mat4x4<u32>': {
        alignment: number;
        size: number;
    };
};
