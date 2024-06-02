/// <reference types="@webgpu/types" />
export type ShaderOptions = {
    device?: GPUDevice;
    prependCode?: string;
    bindGroupNumber?: number;
    getPrevShaderBindGroups?: string;
    functions?: Function[];
    variableTypes?: {
        [key: string]: string | {
            prefix?: string;
            type: string;
        };
    };
    inputs?: any[];
    bindGroupLayouts?: GPUBindGroupLayout[];
    bindGroups?: GPUBindGroup[];
    bindings?: {
        [key: string]: Partial<GPUBindGroupEntry>;
    };
    lastBinding?: number;
    bufferGroups?: any;
    skipCombinedBindings?: boolean;
};
export type RenderOptions = {
    canvas?: HTMLCanvasElement | OffscreenCanvas;
    context?: GPUCanvasContext;
    contextSettings?: GPUCanvasConfiguration;
    renderPipelineDescriptor?: Partial<GPURenderPipelineDescriptor>;
    renderPassDescriptor?: GPURenderPassDescriptor;
    renderPipelineSettings?: any;
    renderPass?: RenderPassSettings;
};
export type ComputeOptions = {
    workGroupSize?: number;
    computePipelineSettings?: GPUComputePipelineDescriptor;
    computePass?: ComputePassSettings;
};
export type ShaderPassSettings = {
    bufferOnly?: boolean;
    skipOutputDef?: boolean;
    bindGroupNumber?: number;
};
export type RenderPassSettings = {
    vertexCount?: number;
    instanceCount?: number;
    firstVertex?: number;
    firstInstance?: number;
    viewport?: any;
    scissorRect?: any;
    blendConstant?: any;
    indexBuffer?: any;
    indexFormat?: 'uint16' | 'uint32';
    firstIndex?: number;
    useRenderBundle?: any;
    vbos?: ({
        stepMode?: 'instance' | 'vertex';
        [key: string]: string;
    } | Float32Array | GPUBuffer)[];
    outputVBOs?: boolean;
    textures?: {
        [key: string]: TextureInfo | ImageBitmap;
    };
    outputTextures?: boolean;
    newBindings?: boolean;
} & ShaderPassSettings;
export type ComputePassSettings = {
    workgroupsX?: number;
    workgroupsY?: number;
    workgroupsZ?: number;
} & ShaderPassSettings;
export type TranspiledShader = {
    code: string;
    header: string;
    bindGroupNumber: number;
    lastBinding: number;
    ast: any[];
    params: any[];
    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize?: number;
    altBindings?: any;
    returnedVars?: any;
};
export type BufferGroup = {
    params: any[];
    returnedVars: string[];
    inputTypes: {
        [key: string]: any;
    };
    firstPass?: boolean;
    bindGroup?: GPUBindGroup;
    renderBundle?: GPURenderBundle;
    inputBuffers: {
        [key: string]: GPUBuffer;
    };
    outputBuffers: {
        [key: string]: GPUBuffer;
    };
    uniformBuffer?: GPUBuffer;
    uniformBufferInputs: {
        [key: string]: any;
    };
    totalUniformBufferSize?: number;
    defaultUniformBuffer?: GPUBuffer;
    totalDefaultUniformBufferSize?: number;
    defaultUniformBinding?: number;
    textures: {
        [key: string]: GPUTexture;
    };
    samplers?: {
        [key: string]: GPUSampler;
    };
    defaultUniforms: {
        [key: string]: any;
    };
    indexCount?: number;
    indexBuffer?: GPUBuffer;
    indexFormat?: GPUIndexFormat;
    vertexBuffers?: GPUBuffer[];
    vertexCount?: number;
    bindGroupLayoutEntries: GPUBindGroupEntry[] | GPUBindGroupLayoutEntry[];
};
export type TextureInfo = {
    source?: ImageBitmap | any;
    texture?: GPUTextureDescriptor;
    buffer?: BufferSource | SharedArrayBuffer;
    width: number;
    height: number;
    bytesPerRow?: number;
    label?: string;
    format?: GPUTextureFormat;
    usage?: any;
    layout?: GPUImageDataLayout | GPUImageCopyExternalImage;
    mipLevelCount?: number;
    isDepth?: boolean;
    isStorage?: boolean;
    isSampler?: boolean;
    isComparisonSampler?: boolean;
};
