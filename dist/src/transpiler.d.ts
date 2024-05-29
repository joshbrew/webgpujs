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
        position: boolean;
        pixel: boolean;
    };
    static parse: (fstr: any, tokens: any, shaderType: string, vertexBufferOptions: any) => any[];
    static inferTypeFromValue(value: any, funcStr: any, ast: any, defaultValue?: any): any;
    static flattenStrings(arr: any): any;
    static generateDataStructures(funcStr: any, ast: any, bindGroup?: number, shaderType?: 'compute' | 'fragment' | 'vertex', variableTypes?: {
        [key: string]: string | {
            prefix?: string;
            type: string;
        };
    }, minBinding?: number): {
        code: string;
        params: any[];
        defaultUniforms: any;
        lastBinding: number;
    };
    static extractAndTransposeInnerFunctions: (body: any, extract: boolean, ast: any, params: any, shaderType: any, vertexBufferOptions: any) => {
        body: any;
        extractedFunctions: string;
    };
    static generateMainFunctionWorkGroup(funcStr: string, ast: any, params: any, shaderType: string, vertexBufferOptions: {
        [key: string]: string;
    }[], workGroupSize: number, gpuFuncs: (Function | string)[]): string;
    static transposeBody: (body: any, funcStr: any, params: any, shaderType: any, returns: boolean, shaderHead: string, extractConsts: boolean, vertexBufferOptions: any) => {
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
    static convertToWebGPU(func: Function | string, shaderType?: 'compute' | 'vertex' | 'fragment', bindGroupNumber?: number, workGroupSize?: number, vertexBufferOptions?: {
        [key: string]: string;
    }[], gpuFuncs?: (Function | string)[], variableTypes?: {
        [key: string]: string | {
            prefix?: string;
            type: string;
        };
    }, lastBinding?: number): TranspiledShader;
}
export declare const replacements: {
    'Math.PI': string;
    'Math.E': string;
    'Math.LN10': string;
    'Math.LN2': string;
    'Math.LOG10E': string;
    'Math.LOG2E': string;
    'Math.SQRT1_2': string;
    'Math.SQRT2': string;
    'Math.abs': string;
    'Math.acos': string;
    'Math.acosh': string;
    'Math.asin': string;
    'Math.asinh': string;
    'Math.atan': string;
    'Math.atan2': string;
    'Math.atanh': string;
    'Math.ceil': string;
    'Math.cos': string;
    'Math.cosh': string;
    'Math.clz32': string;
    'Math.exp': string;
    'Math.floor': string;
    'Math.log': string;
    'Math.log2': string;
    'Math.max': string;
    'Math.min': string;
    'Math.pow': string;
    'Math.round': string;
    'Math.sin': string;
    'Math.sinh': string;
    'Math.sqrt': string;
    'Math.tan': string;
    'Math.tanh': string;
    'Math.trunc': string;
};
export declare const vertexFormats: {
    uint8x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<u32>": boolean;
            vec2u: boolean;
        };
    };
    uint8x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<u32>": boolean;
            vec4u: boolean;
        };
    };
    sint8x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<i32>": boolean;
            vec2i: boolean;
        };
    };
    sint8x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<i32>": boolean;
            vec4i: boolean;
        };
    };
    unorm8x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<f32>": boolean;
            vec2f: boolean;
        };
    };
    unorm8x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<f32>": boolean;
            vec4f: boolean;
        };
    };
    snorm8x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<f32>": boolean;
            vec2f: boolean;
        };
    };
    snorm8x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<f32>": boolean;
            vec4f: boolean;
        };
    };
    uint16x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<u32>": boolean;
            vec2u: boolean;
        };
    };
    uint16x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<u32>": boolean;
            vec4u: boolean;
        };
    };
    sint16x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<i32>": boolean;
            vec2i: boolean;
        };
    };
    sint16x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<i32>": boolean;
            vec4i: boolean;
        };
    };
    unorm16x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<f32>": boolean;
            vec2f: boolean;
        };
    };
    unorm16x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<f32>": boolean;
            vec4f: boolean;
        };
    };
    snorm16x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<f32>": boolean;
            vec2f: boolean;
        };
    };
    snorm16x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<f32>": boolean;
            vec4f: boolean;
        };
    };
    float16x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<f16>": boolean;
            vec2h: boolean;
        };
    };
    float16x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<f16>": boolean;
            vec4h: boolean;
        };
    };
    float32: {
        byteSize: number;
        wgslTypes: {
            f32: boolean;
        };
    };
    float32x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<f32>": boolean;
            vec2f: boolean;
        };
    };
    float32x3: {
        byteSize: number;
        wgslTypes: {
            "vec3<f32>": boolean;
            vec3f: boolean;
        };
    };
    float32x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<f32>": boolean;
            vec4f: boolean;
        };
    };
    uint32: {
        byteSize: number;
        wgslTypes: {
            u32: boolean;
        };
    };
    uint32x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<u32>": boolean;
            vec2u: boolean;
        };
    };
    uint32x3: {
        byteSize: number;
        wgslTypes: {
            "vec3<u32>": boolean;
            vec3u: boolean;
        };
    };
    uint32x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<u32>": boolean;
            vec4u: boolean;
        };
    };
    sint32: {
        byteSize: number;
        wgslTypes: {
            i32: boolean;
        };
    };
    sint32x2: {
        byteSize: number;
        wgslTypes: {
            "vec2<i32>": boolean;
            vec2i: boolean;
        };
    };
    sint32x3: {
        byteSize: number;
        wgslTypes: {
            "vec3<i32>": boolean;
            vec3i: boolean;
        };
    };
    sint32x4: {
        byteSize: number;
        wgslTypes: {
            "vec4<i32>": boolean;
            vec4i: boolean;
        };
    };
};
export declare const textureFormats: string[];
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
        vertexFormats: {
            float16x2: boolean;
            float16x4: boolean;
        };
    };
    'vec2<f16>': {
        alignment: number;
        size: number;
        vertexFormats: {
            float16x2: boolean;
        };
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
        vertexFormats: {
            float16x4: boolean;
        };
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
    mat2x2h: {
        alignment: number;
        size: number;
    };
    mat3x2h: {
        alignment: number;
        size: number;
    };
    mat4x2h: {
        alignment: number;
        size: number;
    };
    mat2x3h: {
        alignment: number;
        size: number;
    };
    mat3x3h: {
        alignment: number;
        size: number;
    };
    mat4x3h: {
        alignment: number;
        size: number;
    };
    mat2x4h: {
        alignment: number;
        size: number;
    };
    mat3x4h: {
        alignment: number;
        size: number;
    };
    mat4x4h: {
        alignment: number;
        size: number;
    };
} & {
    bool: {
        alignment: number;
        size: number;
        ct: number;
    };
    u8: {
        alignment: number;
        size: number;
        ct: number;
    };
    i8: {
        alignment: number;
        size: number;
        ct: number;
    };
    i32: {
        alignment: number;
        size: number;
        vertexFormats: {
            sint32: boolean;
        };
        ct: number;
    };
    u32: {
        alignment: number;
        size: number;
        vertexFormats: {
            uint32: boolean;
        };
        ct: number;
    };
    f32: {
        alignment: number;
        size: number;
        vertexFormats: {
            float32: boolean;
        };
        ct: number;
    };
    i64: {
        alignment: number;
        size: number;
        ct: number;
    };
    u64: {
        alignment: number;
        size: number;
        ct: number;
    };
    f64: {
        alignment: number;
        size: number;
        ct: number;
    };
    'atomic<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'atomic<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'vec2<i32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            sint8x2: boolean;
            sint16x2: boolean;
            sint32x2: boolean;
        };
        ct: number;
    };
    'vec2<u32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            uint8x2: boolean;
            uint16x2: boolean;
            uint32x2: boolean;
        };
        ct: number;
    };
    'vec2<f32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            unorm8x2: boolean;
            unorm16x2: boolean;
            float32x2: boolean;
            snorm8x2: boolean;
            snorm16x2: boolean;
        };
        ct: number;
    };
    'vec3<i32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            sint32x3: boolean;
        };
        ct: number;
    };
    'vec3<u32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            uint32x3: boolean;
        };
        ct: number;
    };
    'vec3<f32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            float32x3: boolean;
        };
        ct: number;
    };
    'vec4<i32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            sint8x4: boolean;
            sint16x4: boolean;
            sint32x4: boolean;
        };
        ct: number;
    };
    'vec4<u32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            uint8x4: boolean;
            uint16x4: boolean;
            uint32x4: boolean;
        };
        ct: number;
    };
    'vec4<f32>': {
        alignment: number;
        size: number;
        vertexFormats: {
            unorm8x4: boolean;
            unorm16x4: boolean;
            float32x4: boolean;
            snorm8x4: boolean;
            snorm16x4: boolean;
            float16x4: boolean;
        };
        ct: number;
    };
    vec2i: {
        alignment: number;
        size: number;
        vertexFormats: {
            sint8x2: boolean;
            sint16x2: boolean;
            sint32x2: boolean;
        };
        ct: number;
    };
    vec2u: {
        alignment: number;
        size: number;
        vertexFormats: {
            uint8x2: boolean;
            uint16x2: boolean;
            uint32x2: boolean;
        };
        ct: number;
    };
    vec2f: {
        alignment: number;
        size: number;
        vertexFormats: {
            unorm8x2: boolean;
            unorm16x2: boolean;
            float32x2: boolean;
            snorm8x2: boolean;
            snorm16x2: boolean;
        };
        ct: number;
    };
    vec3i: {
        alignment: number;
        size: number;
        vertexFormats: {
            sint32x3: boolean;
        };
        ct: number;
    };
    vec3u: {
        alignment: number;
        size: number;
        vertexFormats: {
            uint32x3: boolean;
        };
        ct: number;
    };
    vec3f: {
        alignment: number;
        size: number;
        vertexFormats: {
            float32x3: boolean;
        };
        ct: number;
    };
    vec4i: {
        alignment: number;
        size: number;
        vertexFormats: {
            sint8x4: boolean;
            sint16x4: boolean;
            sint32x4: boolean;
        };
        ct: number;
    };
    vec4u: {
        alignment: number;
        size: number;
        vertexFormats: {
            uint8x4: boolean;
            uint16x4: boolean;
            uint32x4: boolean;
        };
        ct: number;
    };
    vec4f: {
        alignment: number;
        size: number;
        vertexFormats: {
            unorm8x4: boolean;
            unorm16x4: boolean;
            float32x4: boolean;
            snorm8x4: boolean;
            snorm16x4: boolean;
            float16x4: boolean;
        };
        ct: number;
    };
    'mat2x2<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat2x2<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat2x2<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x2<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x2<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x2<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x2<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x2<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x2<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat2x3<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat2x3<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat2x3<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x3<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x3<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x3<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x3<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x3<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x3<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat2x4<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat2x4<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat2x4<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x4<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x4<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat3x4<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x4<f32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x4<i32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    'mat4x4<u32>': {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x2f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x2i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x2u: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x2f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x2i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x2u: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x2f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x2i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x2u: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x3f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x3i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x3u: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x3f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x3i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x3u: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x3f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x3i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x3u: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x4f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x4i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat2x4u: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x4f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x4i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat3x4u: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x4f: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x4i: {
        alignment: number;
        size: number;
        ct: number;
    };
    mat4x4u: {
        alignment: number;
        size: number;
        ct: number;
    };
};
