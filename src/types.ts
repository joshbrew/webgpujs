export type ShaderOptions = {
    device?:GPUDevice
    prependCode?:string,
    bindGroupNumber?:number,
    previousPipeline?:any, //list shader code from previous pipeline(s) to combine bindings
    functions?:Function[],
    variableTypes?:{[key:string]:string|{ prefix?: string; type: string; }}, //we can skip the implicit typing of the bindings and set them ourselves e.g. tex1:'texture_2d' or tex1:{prefix:'var', type:'texture_2d'} etc.
    inputs?:any[],
    bindGroupLayouts?:GPUBindGroupLayout[],
    bindGroups?:GPUBindGroup[],
    bindings?:{[key:string]:Partial<GPUBindGroupEntry>}
    lastBinding?:number,
    params?:Param[],
    bufferGroups?:BufferGroup[],
    skipCombinedBindings?:boolean
}

export type RenderOptions = {
    canvas?:HTMLCanvasElement|OffscreenCanvas,
    context?:GPUCanvasContext,
    contextSettings?:GPUCanvasConfiguration,
    renderPipelineDescriptor?:Partial<GPURenderPipelineDescriptor>, //specify partial settings e.g. the primitive topology
    renderPassDescriptor?:GPURenderPassDescriptor,
    renderPipelineSettings?:any,
    renderPass?:RenderPassSettings
};

export type ComputeOptions = {
    workGroupSize?:number,
    computePipelineSettings?:GPUComputePipelineDescriptor,
    computePass?:ComputePassSettings
};

export type ShaderPassSettings = {
    bufferOnly?:boolean,
    skipOutputDef?:boolean,
    bindGroupNumber?:number //can buffer specific bindGroupNumbers
};

export type RenderPassSettings = {
    vertexCount?:number,
    instanceCount?:number,
    firstVertex?:number,
    firstInstance?:number,
    viewport?:any,
    scissorRect?:any,
    blendConstant?:any,
    indexBuffer?:any,
    indexFormat?:'uint16'|'uint32', //uint16 or uint32
    firstIndex?:number,
    useRenderBundle?:any,
    vbos?:({
        //option spec
        stepMode?:'instance'|'vertex',
        [key:string]:string
    }|Float32Array|GPUBuffer)[],
    outputVBOs?:boolean,
    textures?:{
        [key:string]:TextureInfo|ImageBitmap
    },
    outputTextures?:boolean,
    newBindings?:boolean
} & ShaderPassSettings;

export type ComputePassSettings = {
    workgroupsX?:number,
    workgroupsY?:number,
    workgroupsZ?:number
} & ShaderPassSettings;


export type Param = {
    type:'array'|'variable',
    name:string,
    value:string,
    isInput:boolean,
    length?:number,
    isReturned:boolean,
    isModified:boolean,
    isUniform?:boolean

    binding?:number|string
    group?:number|string,
    sharedBinding?:boolean,

    isTexture?:boolean,
    isStorageTexture?:boolean, //something to help with identifying in the bindgroup automation 
    isSampler?:boolean,
    isComparisonSampler?:boolean,
    isDepthTexture?:boolean,

    isSharedStorageTexture?:boolean,

    is3dStorageTexture?:boolean,
    is1dStorageTexture?:boolean,
    is2dStorageTextureArray?:boolean,
    isDepthTextureArray?:boolean,
    isDepthCubeArrayTexture?:boolean,
    isDepthCubeTexture?:boolean,
    isDepthMSAATexture?:boolean,
    isDepthTexture2d?:boolean,
    isCubeArrayTexture?:boolean,
    isCubeTexture?:boolean,
    is3dTexture?:boolean,
    isis2dTextureArrayDepthTextureArray?:boolean,
    is1dTexture?:boolean,
    is2dMSAATexture?:boolean,
    

}

export type TranspiledShader = {
    code: string;
    header: string;
    bindGroupNumber:number;
    lastBinding:number; //the last binding in the list, e.g. vertex and fragment bindings need to be in series
    ast: any[];
    params: Param[];
    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize?: number;
    altBindings?: any;
    returnedVars?: any;
}


export type BufferGroup = {
    params:Param[],
    returnedVars:string[],
    inputTypes:{[key:string]:any}
    firstPass?:boolean

    bindGroup?:GPUBindGroup,
    renderBundle?:GPURenderBundle

    inputBuffers:{
        [key:string]:GPUBuffer
    },
    outputBuffers:{
        [key:string]:GPUBuffer
    },

    uniformBuffer?:GPUBuffer,
    uniformBufferInputs:{[key:string]:any},
    totalUniformBufferSize?:number

    defaultUniformBuffer?:GPUBuffer,
    totalDefaultUniformBufferSize?:number
    defaultUniformBinding?:number

    textures:{[key:string]:GPUTexture},
    samplers?:{[key:string]:GPUSampler},
    defaultUniforms:{[key:string]:any}, //defined in the transpiler class
    indexCount?:number,
    indexBuffer?:GPUBuffer,
    indexFormat?:GPUIndexFormat,
    vertexBuffers?:GPUBuffer[],
    vertexCount?:number,
    bindGroupLayoutEntries:GPUBindGroupEntry[]|GPUBindGroupLayoutEntry[],

    //[key:string]:any
}


export type TextureInfo = {
    source?:ImageBitmap|any,
    texture?:GPUTextureDescriptor,
    buffer?:BufferSource | SharedArrayBuffer,
    width:number, 
    height:number, 
    bytesPerRow?:number,
    label?:string, 
    format?:GPUTextureFormat, //default: 'rgba8unorm' 
    usage?:any,
    layout?:GPUImageDataLayout|GPUImageCopyExternalImage, //customize the layout that gets created for an image source e.g. flipY
    
    mipLevelCount?:number //todo: support more stuff or roll it in neater

    isDepth?:boolean, //depth texture?
    isStorage?:boolean, //something to help with identifying in the bindgroup automation
    isSampler?:boolean,
    isComparisonSampler?:boolean
}