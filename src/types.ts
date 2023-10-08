export type ShaderOptions = {
    device?:GPUDevice
    prependCode?:string,
    bindGroupNumber?:number,
    getPrevShaderBindGroups?:string,
    functions:Function[],
    inputs?:any[],
    bindGroupLayouts?:GPUBindGroupLayoutEntry[],
    skipCombinedBindings?:boolean
}

export type RenderOptions = {
    canvas:HTMLCanvasElement|OffscreenCanvas,
    context?:GPUCanvasContext,
    contextSettings?:GPUCanvasConfiguration,
    renderPipelineSettings?:any,
    nVertexBuffers?:number,
    renderPass:RenderPassSettings
};

export type ComputeOptions = {
    workGroupSize?:number,
    computePass:ComputePassSettings,
    computePipelineSettings?:GPUComputePipelineDescriptor
};

export type ShaderPassSettings = {
    bufferOnly?:boolean,
    skipOutputDef?:boolean
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
    indexFormat?:any, //uint16 or uint32
    firstIndex?:number,
    useRenderBundle?:any,
    vbos?:(Float32Array|{
        color?:number[]|(number[][]),
        position?:number[]|(number[][]),
        normal?:number[]|(number[][]),
        uv?:number[]|(number[][])
    })[]
    textures?:{
        [key:string]:{
            label?:string, 
            format?:string, 
            width:number, 
            height:number, 
            usage?:any
        }
    }
    textureSettings?:any,
    samplerSettings?:any
} & ShaderPassSettings;

export type ComputePassSettings = {
    workgroupsX?:number,
    workgroupsY?:number,
    workgroupsZ?:number
} & ShaderPassSettings;


export type TranspiledShader = {
    code: string;
    bindings: string;
    ast: any[];
    params: any[];
    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize?: number;
    altBindings?: any;
    returnedVars?: any;
}
