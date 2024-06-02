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
export type Param = {
    type: 'array' | 'variable';
    name: string;
    value: string;
    isInput: boolean;
    length?: number;
    isReturned: boolean;
    isModified: boolean;
    isUniform?: boolean;
    binding?: number | string;
    isTexture?: boolean;
    isStorageTexture?: boolean;
    isSampler?: boolean;
    isComparisonSampler?: boolean;
    isDepthTexture?: boolean;
    isSharedStorageTexture?: boolean;
    is3dStorageTexture?: boolean;
    is1dStorageTexture?: boolean;
    is2dStorageTextureArray?: boolean;
    isDepthTextureArray?: boolean;
    isDepthCubeArrayTexture?: boolean;
    isDepthCubeTexture?: boolean;
    isDepthMSAATexture?: boolean;
    isDepthTexture2d?: boolean;
    isCubeArrayTexture?: boolean;
    isCubeTexture?: boolean;
    is3dTexture?: boolean;
    isis2dTextureArrayDepthTextureArray?: boolean;
    is1dTexture?: boolean;
    is2dMSAATexture?: boolean;
};
export type TranspiledShader = {
    code: string;
    header: string;
    bindGroupNumber: number;
    lastBinding: number;
    ast: any[];
    params: Param[];
    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize?: number;
    altBindings?: any;
    returnedVars?: any;
};
export type BufferGroup = {
    params: Param[];
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
