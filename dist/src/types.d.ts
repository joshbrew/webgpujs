/// <reference types="@webgpu/types" />
export type ShaderOptions = {
    device?: GPUDevice;
    prependCode?: string;
    bindGroupNumber?: number;
    getPrevShaderBindGroups?: string;
    functions?: Function[];
    variableTypes?: {
        [key: string]: string | {
            binding: string;
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
    nVertexBuffers?: number;
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
    vbos?: (Float32Array | {
        vertex?: number[] | (number[][]);
        color?: number[] | (number[][]);
        uv?: number[] | (number[][]);
        normal?: number[] | (number[][]);
    })[];
    outputVBOs?: boolean;
    textures?: {
        [key: string]: {
            source?: ImageBitmap | any;
            texture?: GPUTextureDescriptor;
            width: number;
            height: number;
            bytesPerRow?: number;
            label?: string;
            format?: string;
            usage?: any;
            samplerSettings?: any;
            layout?: GPUImageDataLayout | GPUImageCopyExternalImage;
        } | ImageBitmap;
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
