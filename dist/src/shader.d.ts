/// <reference types="@webgpu/types" />
import { ShaderOptions, RenderOptions, ComputeOptions, RenderPassSettings, ComputePassSettings, TranspiledShader } from './types';
export declare class ShaderHelper {
    prototypes: {
        compute?: TranspiledShader;
        fragment?: TranspiledShader;
        vertex?: TranspiledShader;
    };
    compute?: ShaderContext;
    vertex?: ShaderContext;
    fragment?: ShaderContext;
    process: (...inputs: any[]) => any;
    render: (renderPass?: RenderPassSettings, ...inputs: any[]) => any;
    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: GPUCanvasContext | OffscreenRenderingContext;
    device: GPUDevice;
    functions: (Function | string)[];
    bindGroupLayouts: GPUBindGroupLayout[];
    bindGroups: GPUBindGroup[];
    bufferGroups: any[];
    constructor(shaders: {
        compute?: TranspiledShader;
        fragment?: TranspiledShader;
        vertex?: TranspiledShader;
    }, options: ShaderOptions & ComputeOptions & RenderOptions);
    init: (shaders: {
        compute?: TranspiledShader;
        fragment?: TranspiledShader;
        vertex?: TranspiledShader;
    }, options?: ShaderOptions & ComputeOptions & RenderOptions) => void;
    addFunction: (func: Function | string) => void;
    generateShaderBoilerplate: (shaders: any, options: any) => any;
    cleanup: () => void;
    createRenderPipelineDescriptor: (nVertexBuffers?: number, swapChainFormat?: GPUTextureFormat) => GPURenderPipelineDescriptor;
    createRenderPassDescriptor: () => GPURenderPassDescriptor;
    updateGraphicsPipeline: (nVertexBuffers?: number, contextSettings?: GPUCanvasConfiguration, renderPipelineDescriptor?: GPURenderPipelineDescriptor, renderPassDescriptor?: GPURenderPassDescriptor) => void;
    static flattenArray(arr: any): any[];
    static combineVertices(colors: any, //4d vec array
    positions: any, //3d vec array
    normals: any, //3d vec array
    uvs: any): Float32Array;
    static splitVertices(interleavedVertices: any): {
        positions: Float32Array;
        colors: Float32Array;
        normal: Float32Array;
        uvs: Float32Array;
    };
}
export declare class ShaderContext {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: GPUCanvasContext | OffscreenRenderingContext;
    device: GPUDevice;
    helper: ShaderHelper;
    code: string;
    bindings: string;
    ast: any[];
    params: any[];
    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize?: number;
    returnedVars?: any[];
    functions: any;
    shaderModule?: GPUShaderModule;
    pipelineLayout?: GPUPipelineLayout;
    computePass?: ComputePassSettings;
    renderPass?: RenderPassSettings;
    computePipeline?: GPUComputePipeline;
    graphicsPipeline?: GPURenderPipeline;
    renderPassDescriptor: GPURenderPassDescriptor;
    indexBuffer: GPUBuffer;
    indexFormat: string;
    contextSettings: any;
    altBindings: any;
    builtInUniforms: any;
    bufferGroups: any[];
    bindGroups: GPUBindGroup[];
    bindGroupLayouts: GPUBindGroupLayout[];
    bindGroupNumber: number;
    bindGroupLayout: GPUBindGroupLayout;
    bindGroupLayoutEntries: any;
    constructor(props?: any);
    createBindGroupEntries: (textures?: any, bindGroupNumber?: number, visibility?: number) => GPUBindGroupLayoutEntry[];
    setBindGroupLayout: (entries?: any[], bindGroupNumber?: number) => GPUBindGroupLayout;
    updateVBO: (vertices: any, index?: number, bufferOffset?: number, dataOffset?: number, bindGroupNumber?: number) => void;
    updateTexture: (texture: any, name: string, samplerSettings?: any, bindGroupNumber?: number) => boolean;
    setUBOposition: (dataView: any, inputTypes: any, typeInfo: any, offset: any, input: any, inpIdx: any) => any;
    updateUBO: (inputs: any, inputTypes: any, bindGroupNumber?: number) => void;
    makeBufferGroup: (bindGroupNumber?: number) => any;
    buffer: ({ vbos, textures, skipOutputDef, bindGroupNumber, outputVBOs, outputTextures }?: any, ...inputs: any[]) => boolean;
    getOutputData: (commandEncoder: GPUCommandEncoder, outputBuffers?: any) => any;
    run: ({ vertexCount, instanceCount, firstVertex, firstInstance, vbos, outputVBOs, textures, outputTextures, bufferOnly, skipOutputDef, bindGroupNumber, viewport, scissorRect, blendConstant, indexBuffer, firstIndex, indexFormat, useRenderBundle, workgroupsX, workgroupsY, workgroupsZ }?: {
        vertexCount?: number;
        instanceCount?: number;
        firstVertex?: number;
        firstInstance?: number;
        viewport?: any;
        scissorRect?: any;
        blendConstant?: any;
        indexBuffer?: any;
        indexFormat?: any;
        firstIndex?: number;
        useRenderBundle?: any;
        vbos?: (Float32Array | {
            color?: number[] | number[][];
            position?: number[] | number[][];
            normal?: number[] | number[][];
            uv?: number[] | number[][];
        })[];
        outputVBOs?: boolean;
        textures?: {
            [key: string]: {
                data: Uint8Array;
                width: number;
                height: number;
                bytesPerRow?: number;
                label?: string;
                format?: string;
                usage?: any;
                samplerSettings?: any;
            } | ImageBitmap;
        };
        outputTextures?: boolean;
    } & import("./types").ShaderPassSettings & {
        workgroupsX?: number;
        workgroupsY?: number;
        workgroupsZ?: number;
    }, ...inputs: any[]) => any;
}