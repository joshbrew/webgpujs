export type ShaderOptions = {
    device?:GPUDevice
    prependCode?:string,
    bindGroupNumber?:number,
    getPrevShaderBindGroups?:string,
    functions?:Function[],
    variableTypes?:{[key:string]:string|{ prefix?: string; type: string; }}, //we can skip the implicit typing of the bindings and set them ourselves e.g. tex1:'texture_2d' or tex1:{prefix:'var', type:'texture_2d'} etc.
    vboTypes?:{[key:string]:string}, //e.g. 'vertexIn:"float32x4"'
    inputs?:any[],
    bindGroupLayouts?:GPUBindGroupLayout[],
    bindGroups?:GPUBindGroup[],
    bindings?:{[key:string]:Partial<GPUBindGroupEntry>}
    lastBinding?:number,
    bufferGroups?:any,
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
    vbos?:(Float32Array|{
        vertex?:number[]|(number[][]), //vec4f
        color?:number[]|(number[][]), //vec4f
        uv?:number[]|(number[][]),      //vec2f
        normal?:number[]|(number[][]) //vec3f
    })[],
    outputVBOs?:boolean,
    textures?:{
        [key:string]:{
            source?:ImageBitmap|any,
            texture?:GPUTextureDescriptor,        
            buffer?:BufferSource | SharedArrayBuffer,
            width:number, 
            height:number, 
            bytesPerRow?:number,
            label?:string, 
            format?:string, //default: 'rgba8unorm' 
            usage?:any,
            samplerSettings?:any,
            layout?:GPUImageDataLayout|GPUImageCopyExternalImage //customize the layout that gets created for an image source e.g. flipY
            isStorage?:boolean
        }|ImageBitmap
    },
    outputTextures?:boolean,
    newBindings?:boolean
} & ShaderPassSettings;

export type ComputePassSettings = {
    workgroupsX?:number,
    workgroupsY?:number,
    workgroupsZ?:number
} & ShaderPassSettings;


export type TranspiledShader = {
    code: string;
    header: string;
    bindGroupNumber:number;
    lastBinding:number; //the last binding in the list, e.g. vertex and fragment bindings need to be in series
    ast: any[];
    params: any[];
    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize?: number;
    altBindings?: any;
    returnedVars?: any;
}

