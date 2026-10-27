import { BuiltinInputs } from "./builtin-inputs.js";
import { type ReadbackOutputs } from "./readback.js";
import { type ResourceRecord } from "./lifecycle.js";
import type { PipelineOptions, ShaderInput } from "./types.js";
import type { ShaderResource } from "./types.js";
import { ShaderOptions, RenderOptions, ComputeOptions, RenderPassSettings, ComputePassSettings, TranspiledShader, BufferGroup, TextureInfo, Param, WorkgroupSize, RenderPipelineOverrides, VertexBufferOptions } from "./types.js";
import { combineVertices, flattenArray, splitVertices } from "./util.js";
export declare class ShaderHelper {
    prototypes: {
        compute?: TranspiledShader;
        fragment?: TranspiledShader;
        vertex?: TranspiledShader;
    };
    options: PipelineOptions;
    private registry;
    private closed;
    get disposed(): boolean;
    assertUsable(): void;
    compute?: ShaderContext;
    vertex?: ShaderContext;
    fragment?: ShaderContext;
    process: (...inputs: (ShaderInput | undefined)[]) => Promise<GPUBuffer | Record<string, GPUBuffer> | Record<string, import("./types.js").ShaderReadback> | import("./types.js").ShaderReadback> | Promise<boolean>;
    render: (renderPass?: RenderPassSettings, ...inputs: (ShaderInput | undefined)[]) => Promise<GPUBuffer | Record<string, GPUBuffer> | Record<string, import("./types.js").ShaderReadback> | import("./types.js").ShaderReadback> | Promise<boolean>;
    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: GPUCanvasContext;
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
    /** @internal Linked allocation records; prefer named inputs and chain.getBuffer(). */
    get resources(): Map<string, ResourceRecord>;
    /** @internal */
    setBuffer(id: string, record: ResourceRecord, buffer: GPUBuffer, owned?: boolean): void;
    /** @internal */
    setTexture(id: string, record: ResourceRecord, texture: GPUTexture, owned?: boolean): void;
    linkedResources: ShaderResource[];
    pendingCompilation: Promise<void>[];
    init: (shaders: {
        compute?: TranspiledShader;
        vertex?: TranspiledShader;
        fragment?: TranspiledShader;
    }, options?: ShaderOptions & ComputeOptions & RenderOptions) => void;
    addFunction: (func: Function | string) => void;
    generateShaderBoilerplate: (shaders: any, options: any) => any;
    /** Release this helper's leases. Caller-owned devices, contexts and resources stay usable. */
    dispose: () => void;
    /** Compatibility alias for dispose(). */
    cleanup: () => void;
    static flattenArray: typeof flattenArray;
    static combineVertices: typeof combineVertices;
    static splitVertices: typeof splitVertices;
}
export declare class ShaderContext {
    entryPoints?: ShaderOptions["entryPoints"];
    constants?: ShaderOptions["constants"];
    asyncCompilation?: boolean;
    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: GPUCanvasContext;
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
    workGroupSize: WorkgroupSize;
    returnedVars?: any[];
    functions: any;
    shaderModule?: GPUShaderModule;
    pipelineLayout?: GPUPipelineLayout;
    computePass?: ComputePassSettings;
    renderPass?: RenderPassSettings;
    computePipeline?: GPUComputePipeline;
    graphicsPipeline?: GPURenderPipeline;
    private localResources;
    private pointerInputs?;
    getBuiltinInputs(): BuiltinInputs;
    private closed;
    private assertUsable;
    private depth;
    get depthTexture(): GPUTexture;
    set depthTexture(texture: GPUTexture);
    private multisample;
    get multisampleTexture(): GPUTexture;
    set multisampleTexture(texture: GPUTexture);
    dispose(): void;
    private sampleCount;
    private renderDepthFormat?;
    private renderColorFormats;
    private automaticColorAttachment;
    private automaticDepthAttachment;
    renderPassDescriptor: GPURenderPassDescriptor;
    indexBuffer: GPUBuffer;
    indexFormat: string;
    contextSettings: GPUCanvasConfiguration;
    altBindings: any;
    builtInUniforms: any;
    bufferGroup: BufferGroup;
    bufferGroups: BufferGroup[];
    bindings?: ShaderOptions["bindings"];
    resources: ShaderResource[];
    samplers?: ShaderOptions["samplers"];
    textureViews?: ShaderOptions["textureViews"];
    bindGroups: GPUBindGroup[];
    externalBindGroups?: GPUBindGroup[];
    bindGroupLayouts: GPUBindGroupLayout[];
    bindGroupNumber: number;
    bindGroupLayout: GPUBindGroupLayout;
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];
    vertexBufferOptions: VertexBufferOptions[];
    private vertexComponents;
    constructor(props?: any);
    createBindGroupEntries: (textures?: RenderPassSettings["textures"], group?: number, visibility?: number) => GPUBindGroupLayoutEntry[];
    setBindGroupLayout: (entries?: any[], group?: number) => GPUBindGroupLayout;
    updateTextures: (textures: RenderPassSettings["textures"], updateBindGroup?: boolean, group?: number) => void;
    updateTexture: (data: TextureInfo | ImageBitmap | any, name: string, group?: number) => boolean;
    setUBOposition: (view: DataView, typeInfo: {
        type: string;
        size: number;
        alignment: number;
    }, offset: number, input: any) => number;
    updateArrayBuffers: (buffers: {
        [key: string]: any;
    }, updateBindGroup?: boolean, group?: number) => void;
    private writeUniform;
    updateUBO: (inputs: any[] | {
        [key: string]: any;
    }, _newBuffer?: boolean, updateBindGroup?: boolean, group?: number) => void;
    updateDefaultUBO: (updateBindGroup?: boolean, group?: number) => void;
    getUBODataView: (group?: number) => DataView<ArrayBuffer>;
    allocateUBO: (group?: number) => boolean;
    updateVBO: (vertices: any, index?: number, bufferOffset?: number, dataOffset?: number, bindGroupNumber?: number, indexBuffer?: boolean, indexFormat?: "uint32" | "uint16") => void;
    createRenderPipelineDescriptor: (vertexBufferOptions?: VertexBufferOptions[], swapChainFormat?: GPUTextureFormat, renderPipelineDescriptor?: RenderPipelineOverrides, shaderType?: "fragment" | "vertex") => GPURenderPipelineDescriptor;
    createRenderPassDescriptor: () => GPURenderPassDescriptor;
    updateGraphicsPipeline: (vertexBufferOptions?: VertexBufferOptions[], contextSettings?: GPUCanvasConfiguration, renderPipelineDescriptor?: RenderPipelineOverrides, renderPassDescriptor?: GPURenderPassDescriptor, shaderType?: "fragment" | "vertex", asynchronous?: boolean) => Promise<void>;
    makeBufferGroup: (group?: number) => BufferGroup;
    private writeStorage;
    buffer: (settings?: Partial<RenderPassSettings & ComputePassSettings>, ...inputs: (ShaderInput | undefined)[]) => boolean;
    updateBindGroup: (group?: number, custom?: GPUBindGroupEntry[]) => void;
    getOutputData: <Buffers extends boolean = false>(encoder: GPUCommandEncoder, outputs?: ReadbackOutputs, returnBuffers?: Buffers) => Promise<import("./readback.js").ReadbackResult<Buffers>>;
    run: ({ vertexCount, instanceCount, firstVertex, firstInstance, vbos, outputVBOs, textures, outputTextures, bufferOnly, skipOutputDef, returnBuffers, bindGroupNumber, viewport, scissorRect, blendConstant, indexBuffer, indexFormat, indexCount, firstIndex, baseVertex, stencilReference, useRenderBundle, workgroupsX, workgroupsY, workgroupsZ, newBindings, commandEncoder: suppliedEncoder, inputs: namedInputs, dynamicOffsets, descriptor, indirect, occlusionQueryIndex, }?: RenderPassSettings & ComputePassSettings & {
        returnBuffers?: boolean;
    }, ...inputs: (ShaderInput | undefined)[]) => Promise<GPUBuffer | Record<string, GPUBuffer> | Record<string, import("./types.js").ShaderReadback> | import("./types.js").ShaderReadback> | Promise<boolean>;
    _allocateInputs(settings: any, ...inputs: (ShaderInput | undefined)[]): boolean;
    _ensureBufferGroup(bindGroupNumber: any): BufferGroup;
    _executeCompute(commandEncoder: any, bindGroupNumber: any, wX: any, wY: any, wZ: any, descriptor?: any, indirect?: ComputePassSettings["indirect"], dynamicOffsets?: Record<number, number[]>): void;
    _executeGraphics(commandEncoder: any, bufferGroup: any, drawParams: any, renderOptions: any): void;
    _prepareRenderTargets(): void;
    _finalize(commandEncoder: any, bufferGroup: any, skipOutputDef: any, returnBuffers: any, submit?: boolean): Promise<GPUBuffer | Record<string, GPUBuffer> | Record<string, import("./types.js").ShaderReadback> | import("./types.js").ShaderReadback> | Promise<boolean>;
}
