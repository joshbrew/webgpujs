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
    process: (...inputs: any[]) => Promise<unknown>;
    render: (renderPass?: RenderPassSettings, ...inputs: any[]) => Promise<unknown>;
    bindGroupLayouts: GPUBindGroupLayout[];
    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: GPUCanvasContext | OffscreenRenderingContext;
    device: GPUDevice;
    bufferGroups: any;
    bindGroups: any;
    functions: (Function | string)[];
    constructor(shaders: {
        compute?: TranspiledShader;
        fragment?: TranspiledShader;
        vertex?: TranspiledShader;
    }, options: ShaderOptions & ComputeOptions & RenderOptions);
    init: (shaders: {
        compute?: TranspiledShader;
        fragment?: TranspiledShader;
        vertex?: TranspiledShader;
    }, options: ShaderOptions & ComputeOptions & RenderOptions) => void;
    addFunction: (func: Function | string) => void;
    generateShaderBoilerplate: (shaders: any, options: any) => any;
    cleanup: () => void;
    createBindGroupFromEntries: (shaderContext: any, shaderType: any, textureSettings?: {}, samplerSettings?: {}, visibility?: number) => any;
    createRenderPipelineDescriptors: (nVertexBuffers?: number, swapChainFormat?: GPUTextureFormat) => GPURenderPipelineDescriptor;
    updateGraphicsPipeline: (nVertexBuffers?: number, contextSettings?: GPUCanvasConfiguration, renderPipelineDescriptor?: GPURenderPipelineDescriptor, renderPassDescriptor?: GPURenderPassDescriptor) => void;
    static flattenArray(arr: any): any[];
    static combineVertices(colors: any, //4d vec array
    positions: any, //3d vec array
    normal: any, //3d vec array
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
    functions: any;
    textures: any;
    samplers: any;
    shaderModule?: GPUShaderModule;
    pipelineLayout?: GPUPipelineLayout;
    computePass?: ComputePassSettings;
    renderPass?: RenderPassSettings;
    nVertexBuffers?: number;
    computePipeline?: GPUComputePipeline;
    graphicsPipeline?: GPURenderPipeline;
    firstPass: boolean;
    renderPassDescriptor: GPURenderPassDescriptor;
    renderBundle: GPURenderBundle;
    vertexBuffers: any;
    indexBuffer: GPUBuffer;
    indexFormat: string;
    vertexCount: number;
    contextSettings: any;
    renderPipelineSettings: GPURenderPipelineDescriptor;
    inputTypes: any;
    uniformBuffer: GPUBuffer;
    uniformBufferInputs: any;
    totalUniformBufferSize: number;
    altBindings: any;
    builtInUniforms: any;
    defaultUniformBinding: number;
    defaultUniformBuffer: GPUBuffer;
    totalDefaultUniformBufferSize: number;
    bindGroup: GPUBindGroup;
    bindGroupLayout: GPUBindGroupLayout;
    bindGroupNumber: number;
    inputBuffers: GPUBuffer[];
    outputBuffers: GPUBuffer[];
    bufferGroup: any;
    bufferGroups: any;
    bindGroups: GPUBindGroup[];
    constructor(props?: any);
    updateVBO: (vertices: any, index?: number, bufferOffset?: number, dataOffset?: number) => void;
    setUBOposition: (dataView: any, inputTypes: any, typeInfo: any, offset: any, input: any, inpIdx: any) => any;
    updateUBO: (inputs: any, inputTypes: any) => void;
    buffer: ({ vbos, textures, samplerSettings, skipOutputDef, bindGroupNumber }?: any, ...inputs: any[]) => boolean;
    getOutputData: (commandEncoder: any) => Promise<unknown>;
    run: ({ vertexCount, instanceCount, firstVertex, firstInstance, vbos, textures, bufferOnly, skipOutputDef, bindGroupNumber, samplerSettings, viewport, scissorRect, blendConstant, indexBuffer, firstIndex, indexFormat, useRenderBundle, workgroupsX, workgroupsY, workgroupsZ }?: {
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
        textures?: {
            [key: string]: {
                data: Uint8Array;
                width: number;
                height: number;
                bytesPerRow?: number;
                label?: string;
                format?: string;
                usage?: any;
            };
        };
        textureSettings?: any;
        samplerSettings?: any;
    } & import("./types").ShaderPassSettings & {
        workgroupsX?: number;
        workgroupsY?: number;
        workgroupsZ?: number;
    }, ...inputs: any[]) => Promise<unknown>;
}
