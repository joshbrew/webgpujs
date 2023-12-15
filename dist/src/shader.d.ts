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
    static flattenArray(arr: any): any[];
    static combineVertices(vertices: any, //4d vec array
    colors: any, //4d vec array
    uvs: any, //2d vec array
    normals: any): Float32Array;
    static splitVertices(interleavedVertices: any): {
        vertices: Float32Array;
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
    vertex?: ShaderContext;
    code: string;
    header: string;
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
    bindings?: Partial<GPUBindGroupEntry>[];
    bindGroups: GPUBindGroup[];
    bindGroupLayouts: GPUBindGroupLayout[];
    bindGroupNumber: number;
    bindGroupLayout: GPUBindGroupLayout;
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];
    constructor(props?: any);
    createBindGroupEntries: (textures?: any, bindGroupNumber?: number, visibility?: number) => GPUBindGroupLayoutEntry[];
    setBindGroupLayout: (entries?: any[], bindGroupNumber?: number) => GPUBindGroupLayout;
    updateVBO: (vertices: any, index?: number, bufferOffset?: number, dataOffset?: number, bindGroupNumber?: number, indexBuffer?: boolean, indexFormat?: 'uint32' | 'uint16') => void;
    updateTexture: (data: {
        source?: ImageBitmap | any;
        texture?: GPUTextureDescriptor;
        width: number;
        height: number;
        bytesPerRow?: number;
        label?: string;
        format?: string;
        usage?: any;
        layout?: GPUImageDataLayout | GPUImageCopyExternalImage;
    } | ImageBitmap | any, name: string, bindGroupNumber?: number) => boolean;
    setUBOposition: (dataView: DataView, inputTypes: any, typeInfo: any, offset: any, input: any, inpIdx: any) => any;
    updateUBO: (inputs: any, inputTypes: any, bindGroupNumber?: number) => void;
    createRenderPipelineDescriptor: (nVertexBuffers?: number, swapChainFormat?: GPUTextureFormat, renderPipelineDescriptor?: Partial<GPURenderPipelineDescriptor>) => Partial<GPURenderPipelineDescriptor>;
    createRenderPassDescriptor: () => GPURenderPassDescriptor;
    updateGraphicsPipeline: (nVertexBuffers?: number, contextSettings?: GPUCanvasConfiguration, renderPipelineDescriptor?: Partial<GPURenderPipelineDescriptor>, renderPassDescriptor?: GPURenderPassDescriptor) => void;
    makeBufferGroup: (bindGroupNumber?: number) => any;
    firstRun: boolean;
    buffer: ({ vbos, textures, indexBuffer, indexFormat, skipOutputDef, bindGroupNumber, outputVBOs, outputTextures, newBindings }?: Partial<{
        vertexCount?: number;
        instanceCount?: number;
        firstVertex?: number;
        firstInstance?: number;
        viewport?: any;
        scissorRect?: any;
        blendConstant?: any;
        indexBuffer?: any;
        indexFormat?: "uint16" | "uint32";
        firstIndex?: number;
        useRenderBundle?: any;
        vbos?: (Float32Array | {
            vertex?: number[] | number[][];
            color?: number[] | number[][];
            uv?: number[] | number[][];
            normal?: number[] | number[][];
        })[];
        outputVBOs?: boolean;
        textures?: {
            [key: string]: ImageBitmap | {
                source?: any;
                texture?: GPUTextureDescriptor;
                width: number;
                height: number;
                bytesPerRow?: number;
                label?: string;
                format?: string;
                usage?: any;
                samplerSettings?: any;
            };
        };
        outputTextures?: boolean;
        newBindings?: boolean;
    } & import("./types").ShaderPassSettings & {
        workgroupsX?: number;
        workgroupsY?: number;
        workgroupsZ?: number;
    }>, ...inputs: any[]) => boolean;
    getOutputData: (commandEncoder: GPUCommandEncoder, outputBuffers?: any) => any;
    run: ({ vertexCount, instanceCount, firstVertex, firstInstance, vbos, outputVBOs, textures, outputTextures, bufferOnly, skipOutputDef, bindGroupNumber, viewport, scissorRect, blendConstant, indexBuffer, indexFormat, firstIndex, useRenderBundle, workgroupsX, workgroupsY, workgroupsZ, newBindings }?: {
        vertexCount?: number;
        instanceCount?: number;
        firstVertex?: number;
        firstInstance?: number;
        viewport?: any;
        scissorRect?: any;
        blendConstant?: any;
        indexBuffer?: any;
        indexFormat?: "uint16" | "uint32";
        firstIndex?: number;
        useRenderBundle?: any;
        vbos?: (Float32Array | {
            vertex?: number[] | number[][];
            color?: number[] | number[][];
            uv?: number[] | number[][];
            normal?: number[] | number[][];
        })[];
        outputVBOs?: boolean;
        textures?: {
            [key: string]: ImageBitmap | {
                source?: any;
                texture?: GPUTextureDescriptor;
                width: number;
                height: number;
                bytesPerRow?: number;
                label?: string;
                format?: string;
                usage?: any;
                samplerSettings?: any;
            };
        };
        outputTextures?: boolean;
        newBindings?: boolean;
    } & import("./types").ShaderPassSettings & {
        workgroupsX?: number;
        workgroupsY?: number;
        workgroupsZ?: number;
    }, ...inputs: any[]) => any;
}
