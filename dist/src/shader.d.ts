import { ShaderOptions, RenderOptions, ComputeOptions, RenderPassSettings, ComputePassSettings, TranspiledShader, BufferGroup, TextureInfo, Param } from './types';
import { flattenArray, combineVertices, splitVertices } from './util';
export declare class ShaderHelper {
    prototypes: {
        compute?: TranspiledShader;
        fragment?: TranspiledShader;
        vertex?: TranspiledShader;
    };
    options: any;
    compute?: ShaderContext;
    vertex?: ShaderContext;
    fragment?: ShaderContext;
    process: (...inputs: any[]) => GPUBuffer | {
        [key: string]: GPUBuffer;
    } | Promise<unknown>;
    render: (renderPass?: RenderPassSettings, ...inputs: any[]) => GPUBuffer | {
        [key: string]: GPUBuffer;
    } | Promise<unknown>;
    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: GPUCanvasContext | OffscreenRenderingContext;
    device: GPUDevice;
    functions: (Function | string)[];
    bindGroupLayouts: GPUBindGroupLayout[];
    bindGroups: GPUBindGroup[];
    bufferGroups: BufferGroup[];
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
    static flattenArray: typeof flattenArray;
    static combineVertices: typeof combineVertices;
    static splitVertices: typeof splitVertices;
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
    params: Param[];
    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize: number;
    returnedVars?: any[];
    functions: any;
    shaderModule?: GPUShaderModule;
    pipelineLayout?: GPUPipelineLayout;
    computePass?: ComputePassSettings;
    renderPass?: RenderPassSettings;
    computePipeline?: GPUComputePipeline;
    graphicsPipeline?: GPURenderPipeline;
    depthTexture: GPUTexture;
    renderPassDescriptor: GPURenderPassDescriptor;
    indexBuffer: GPUBuffer;
    indexFormat: string;
    contextSettings: any;
    altBindings: any;
    builtInUniforms: any;
    bufferGroup: BufferGroup;
    bufferGroups: BufferGroup[];
    bindings?: Partial<GPUBindGroupLayoutEntry>[];
    bindGroups: GPUBindGroup[];
    bindGroupLayouts: GPUBindGroupLayout[];
    bindGroupNumber: number;
    bindGroupLayout: GPUBindGroupLayout;
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];
    vertexBufferOptions: {
        [key: string]: string;
    }[];
    constructor(props?: any);
    createBindGroupEntries: (textures?: {
        [key: string]: TextureInfo;
    }, bindGroupNumber?: number, visibility?: number) => {
        entries: GPUBindGroupLayoutEntry[];
        texturesToUpdate: [TextureInfo, string, number][];
        samplersToCreate: {
            name: string;
            descriptor: GPUSamplerDescriptor;
        }[];
    };
    setBindGroupLayout: (entries?: any[], bindGroupNumber?: number) => GPUBindGroupLayout;
    updateVBO: (vertices: any, index?: number, bufferOffset?: number, dataOffset?: number, bindGroupNumber?: number, indexBuffer?: boolean, indexFormat?: "uint32" | "uint16") => void;
    updateTextures: (textures: {
        [key: string]: TextureInfo;
    }, updateBindGroup?: boolean, bindGroupNumber?: number) => void;
    updateTexture: (data: TextureInfo | ImageBitmap | any, name: string, bindGroupNumber?: number) => boolean;
    setUBOposition: (dataView: DataView, typeInfo: {
        type: string;
        size: number;
        alignment: number;
    }, offset: number, input: any) => number;
    updateArrayBuffers(buffers: {
        [key: string]: any;
    }, //update by name
    updateBindGroup?: boolean, bindGroupNumber?: number): void;
    updateUBO: (inputs: any[] | {
        [key: string]: any;
    }, newBuffer?: boolean, //set true if you want bind groups to be updated for the shader automatically
    updateBindGroup?: boolean, bindGroupNumber?: number) => void;
    updateDefaultUBO: (updateBindGroup?: boolean, bindGroupNumber?: number) => void;
    getUBODataView: (bindGroupNumber?: number) => DataView<ArrayBuffer>;
    allocateUBO: (bindGroupNumber?: number) => boolean;
    createRenderPipelineDescriptor: (vertexBufferOptions?: {
        stepMode?: "vertex" | "instance";
        [key: string]: string;
    }[], swapChainFormat?: GPUTextureFormat, renderPipelineDescriptor?: Partial<GPURenderPipelineDescriptor>, shaderType?: "fragment" | "vertex") => Partial<GPURenderPipelineDescriptor>;
    createRenderPassDescriptor: () => GPURenderPassDescriptor;
    updateGraphicsPipeline: (vertexBufferOptions?: {
        [key: string]: string;
    }[], contextSettings?: GPUCanvasConfiguration, renderPipelineDescriptor?: Partial<GPURenderPipelineDescriptor>, renderPassDescriptor?: GPURenderPassDescriptor, shaderType?: "fragment" | "vertex") => void;
    makeBufferGroup: (bindGroupNumber?: number) => any;
    firstRun: boolean;
    buffer: ({ vbos, textures, indexBuffer, indexFormat, skipOutputDef, bindGroupNumber, outputVBOs, outputTextures, newBindings, }?: Partial<RenderPassSettings & ComputePassSettings>, ...inputs: any[]) => boolean;
    private _ensureBufferGroup;
    private _handleVertexAndIndex;
    private _initInputTypes;
    private _shouldRebuildBindGroup;
    private _processParameters;
    private _applyAltBindings;
    private _ensureDefaultUniformBuffer;
    private _collectOutputs;
    updateBindGroup: (bindGroupNumber?: number, customBindGroupEntries?: GPUBindGroupEntry[]) => void;
    getOutputData: (commandEncoder: GPUCommandEncoder, outputBuffers?: {
        [key: string]: any;
    }, returnBuffers?: boolean) => Promise<(Float32Array | Uint8Array) | {
        [key: string]: Float32Array | Uint8Array;
    }> | {
        [key: string]: GPUBuffer;
    } | GPUBuffer;
    run: ({ vertexCount, instanceCount, firstVertex, firstInstance, vbos, outputVBOs, textures, outputTextures, bufferOnly, skipOutputDef, returnBuffers, bindGroupNumber, viewport, scissorRect, blendConstant, indexBuffer, indexFormat, firstIndex, useRenderBundle, workgroupsX, workgroupsY, workgroupsZ, newBindings }?: {
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
        vbos?: ({
            stepMode?: "instance" | "vertex";
            [key: string]: string;
        } | Float32Array | GPUBuffer)[];
        outputVBOs?: boolean;
        textures?: {
            [key: string]: TextureInfo | ImageBitmap;
        };
        outputTextures?: boolean;
        newBindings?: boolean;
    } & import("./types").ShaderPassSettings & {
        workgroupsX?: number;
        workgroupsY?: number;
        workgroupsZ?: number;
    } & {
        returnBuffers?: boolean;
    }, ...inputs: any[]) => GPUBuffer | {
        [key: string]: GPUBuffer;
    } | Promise<unknown>;
}
