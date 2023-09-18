import { WGSLTranspiler, WGSLTypeSizes } from "./transpiler";

// pipeline, transpiler, shader.

// pipeline handles setup and recycling for webgpu and our shader classes
// transpiler... transpiles
// shader keeps specific data structures and webgpu logic per compute/render pipeline

export type ShaderOptions = {
    prependCode?:string,
    getPrevShaderBindGroups?:string,
    functions:Function[],
    inputs?:any[],
    bindGroupLayouts?:GPUBindGroupLayoutEntry[]
}

export type RenderOptions = {
    canvas:HTMLCanvasElement|OffscreenCanvas,
    context?:GPUCanvasContext,
    contextSettings?:GPUCanvasConfiguration,
    renderPipelineSettings?:any,
    nVertexBuffers?:number,
};

export type ComputeOptions = {
    workGroupSize?:number,
    computePipelineSettings:any
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
    useRenderBundle?:any,
    vbos:(Float32Array|{
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
};

export type ComputePassSettings = {
    workgroupsX?:number,
    workgroupsY?:number,
    workgroupsZ?:number
};


export class Pipeline {

    createPipeline = (
        shaders: Function | {
                code:Function|string, 
                transpileString?:boolean //functions are auto-transpiled
            } | {
                compute:string|Function,
                vertex:string|Function,
                fragment:string|Function,
                transpileString?:boolean
            },
        options:any
    ) => {
        if(typeof shaders === 'function') {
            const block = WGSLTranspiler.convertToWebGPU(
                shaders,
                options.canvas ? 'fragment' : 'compute', 
                options.bindGroupNumber, 
                options.nVertexBuffers, 
                options.workGroupSize, 
                options.functions
            );

            if(options.getPrevShaderBindGroups) {
                let combined = WGSLTranspiler.combineBindings(block.code, options.getPrevShaderBindGroups);
                block.code = combined.code1;
                (block as any).altBindings = combined.changes1;
            }

            
        } else {
            for(const key in shaders) {
                const block = shaders[key] as any;
                if(block.code) {
                    if(typeof block.code === 'function' || block.transpileString) {
                        block.code = WGSLTranspiler.convertToWebGPU(
                            block.code, 
                            options.canvas ? 'fragment' : 'compute', 
                            options.bindGroupNumber, 
                            options.nVertexBuffers, 
                            options.workGroupSize, 
                            options.functions
                        );
                    }

                    if(options.getPrevShaderBindGroups) {
                        let combined = WGSLTranspiler.combineBindings(block.code, options.getPrevShaderBindGroups);
                        block.code = combined.code1;
                        block.altBindings = combined.changes1;
                    }
                } else {
                    if(block.compute) {
                        if(typeof block.compute === 'function' || block.transpileString) {
                            block.compute = WGSLTranspiler.convertToWebGPU(
                                block.compute, 
                                'compute', 
                                options.bindGroupNumber, 
                                options.nVertexBuffers, 
                                options.workGroupSize, 
                                options.functions
                            );
                        }
                    }
                    if(block.vertex) {
                        if(typeof block.vertex === 'function' || block.transpileString) {
                            block.vertex = WGSLTranspiler.convertToWebGPU(
                                block.vertex, 
                                'vertex', 
                                options.bindGroupNumber, 
                                options.nVertexBuffers, 
                                options.workGroupSize, 
                                options.functions
                            );
                        }
                    }
                    if(block.fragment) {
                        if(typeof block.fragment === 'function' || block.transpileString) {
                            block.fragment = WGSLTranspiler.convertToWebGPU(
                                block.fragment, 
                                'fragment', 
                                options.bindGroupNumber, 
                                options.nVertexBuffers, 
                                options.workGroupSize, 
                                options.functions
                            );
                        }
                    }

                    if(block.compute && block.vertex) {
                        let combined = WGSLTranspiler.combineBindings(block.compute.code, block.vertex.code);
                        block.compute.code = combined.code1;
                        block.compute.altBindings = combined.changes1;
                        block.vertex.code = combined.code2; //should have correlated bindings now
                        block.vertex.altBindings = combined.changes2;
                    }
                    if(block.compute && block.fragment) {
                        let combined = WGSLTranspiler.combineBindings(block.compute.code, block.fragment.code);
                        block.compute.code = combined.code1;
                        block.compute.altBindings = combined.changes1;
                        block.fragment.code = combined.code2; //should have correlated bindings now
                        block.fragment.altBindings = combined.changes2;
                    }

                    if(options.getPrevShaderBindGroups) {
                        for(const key in block) {
                            let combined = WGSLTranspiler.combineBindings(block[key].code, options.getPrevShaderBindGroups);
                            block[key].code = combined.code1;
                            block[key].altBindings = combined.changes1;
                        }
                    }
                }
            }
        }
    }

    init = (
        shaders:any={}, 
        {
            textureSettings,
            samplerSettings,
            nVertexBuffers=1,
            contextSettings,
            renderPipelineSettings,
            computePipelineSettings
        }:any={}
    ) => {

    }

    cleanup = (shaderPipeline) => {
        if(shaderPipeline.device) shaderPipeline.device.destroy(); //destroys all info associated with pipelines on this device
        if(shaderPipeline.context) shaderPipeline.context.unconfigure();
    }

    updateGraphicsPipeline(shaders, nVertexBuffers, contextSettings, renderPipelineSettings) {

        // Setup render outputs
        const swapChainFormat = navigator.gpu.getPreferredCanvasFormat();

        shaders.context?.configure(contextSettings ? contextSettings : {
            device: shaders.device, 
            format: swapChainFormat, 
            //usage: GPUTextureUsage.RENDER_ATTACHMENT,
            alphaMode: 'premultiplied'
        });

        //allows 3D rendering
        const depthFormat = "depth24plus";
        const depthTexture = shaders.device.createTexture({
            size: {width: shaders.canvas.width, height: shaders.canvas.height},
            format: depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        // 5: Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
        const vertexBuffers = Array.from({length:nVertexBuffers}, (_,i) => {
            return {
                arrayStride: 48,
                attributes: [
                    {format: "float32x4", offset: 0, shaderLocation:  4*i},     //color
                    {format: "float32x3", offset: 16, shaderLocation: 4*i+1},   //position
                    {format: "float32x3", offset: 28, shaderLocation: 4*i+2},   //normal
                    {format: "float32x2", offset: 40, shaderLocation: 4*i+3}    //uv
                ]
            }
        });

        const pipeline = { //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
            layout: shaders.fragment.pipelineLayout,
            vertex: {
                module: shaders.vertex.shaderModule,
                entryPoint: 'vtx_main',
                buffers: vertexBuffers
            },
            fragment: {
                module: shaders.fragment.shaderModule,
                entryPoint: 'frag_main',
                targets: [{
                    format: swapChainFormat
                }]
            },
            depthStencil: {format: depthFormat, depthWriteEnabled: true, depthCompare: "less"}
        };

        if(renderPipelineSettings) Object.assign(pipeline,renderPipelineSettings);

        shaders.vertex.graphicsPipeline = shaders.device.createRenderPipeline(pipeline);
        shaders.fragment.graphicsPipeline = shaders.vertex.graphicsPipeline;
        
        // const canvasView = this.device.createTexture({
        //     size: [this.canvas.width, this.canvas.height],
        //     sampleCount:4,
        //     format: navigator.gpu.getPreferredCanvasFormat(),
        //     usage: GPUTextureUsage.RENDER_ATTACHMENT,
        // });

        const view = shaders.context.getCurrentTexture().createView();

        const renderPassDescriptor = { //some assumptions
            colorAttachments: [{
                view: view,
                loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "store"
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
                //stencilLoadOp: "clear",
                //stencilClearValue: 0,
                //stencilStoreOp: "store"
            }
        };

        shaders.vertex.renderPassDescriptor = renderPassDescriptor;
        shaders.fragment.renderPassDescriptor = renderPassDescriptor;

        return shaders;
    }

}



//Self contained shader execution boilerplate
export class Shader {

    canvas; 
    context; 
    device; 
    ast; 
    params; 
    funcStr; 
    functions;
    textures;
    samplers;

    computePipeline;
    workGroupSize;

    graphicsPipeline;
    firstPass;
    renderPassDescriptor;
    renderBundle;
    vertexBuffers;
    indexBuffer;
    indexFormat;
    vertexCount;

    inputTypes;

    uniformBuffer;
    uniformBufferInputs;
    totalUniformBufferSize;
    altBindings;

    builtInUniforms;
    defaultUniforms;
    defaultUniformBinding;
    defaultUniformBuffer;
    totalDefaultUniformBufferSize;

    bindGroup;
    bindGroupLayout;
    bindGroupNumber;

    inputBuffers;
    outputBuffers;
    bufferGroup;


    static createPipeline = async (
        shaderFunctions,  
    { //todo: group these up by stage
        device,  //reuse device call
        canvas,  //canvas
        context, //preconfigured canvas?
        contextSettings, //set context settings or they're set automatically
        prepend, //prependable shader code e.g. more complicated uniform buffers and helper functions
        inputs,  //default inputs to upload
        renderOptions, //default options to upload e.g. VBOs and textures, bufferonly, get/don't get output, etc
        nVertexBuffers, //we need to tell the shader compiler if we want multiple vertex buffers (default is 1) e.g. vertex, vertex2, vertex3, vbos are laid out as [pos3,color4,norm3,uv2]. Yu can provide vbo data as objects like {position:[], color:[]} or in prepped float32 arrays
        textureSettings,
        samplerSettings,
        functions, //additional functions if you want to be more manual in adding shader functionality
        prevShaderCode, //we can use the previous shader code to combine bindGroupLayouts
        bindGroupLayouts, //inlcude the previous bind group layouts
        renderPipelineSettings,
        computePipelineSettings,
        workGroupSize
       }:any={}
    ) => {
        if(!bindGroupLayouts) bindGroupLayouts = [] as any[];
        if (!device) {
            const gpu = navigator.gpu;
            const adapter = await gpu.requestAdapter();
            device = await adapter.requestDevice();
        }
        const processor = new Shader();

        if(canvas) {
            processor.canvas = canvas;
            if(!context) context = canvas.getContext('webgpu');
            processor.context = context;
        }

        //Todo: combine bindings, remap buffer inputs in process()
        const shaders = {} as any;
        if (typeof shaderFunctions === 'object') { // Check if shaders are provided as an object

            let bindGroupIncr=bindGroupLayouts.length;
            
            //we are parsing all of the bindings and stuff from the conversion process, so this won't render straight shader code
            if (shaderFunctions.compute) {
                shaders.compute = WGSLTranspiler.convertToWebGPU(
                    shaderFunctions.compute, 'compute', shaders.compute?.bindGroupNumber ? shaders.compute.bindGroupNumber : bindGroupIncr, nVertexBuffers, workGroupSize, functions
                );
                if(prepend) {
                    if(typeof prepend === 'string') shaders.compute.code = prepend + '\n' + shaders.compute.code;
                    else if(prepend?.compute) {
                        shaders.compute.code = prepend.compute + '\n' + shaders.compute.code;
                    }
                    bindGroupIncr++;
                }
            }
            if (shaderFunctions.vertex) {
                shaders.vertex = WGSLTranspiler.convertToWebGPU(
                    shaderFunctions.vertex, 'vertex', shaders.vertex?.bindGroupNumber ? shaders.vertex.bindGroupNumber : bindGroupIncr, nVertexBuffers, undefined, functions
                );
                if(prepend) {
                    if(typeof prepend === 'string') shaders.vertex.code = prepend + '\n' + shaders.vertex.code;
                    else if(prepend?.vertex) {
                        shaders.vertex.code = prepend.vertex + '\n' + shaders.vertex.code;
                    }
                }
            }  
            if (shaderFunctions.fragment) {
                shaders.fragment = WGSLTranspiler.convertToWebGPU(
                    shaderFunctions.fragment, 'fragment', shaders.fragment?.bindGroupNumber ? shaders.fragment.bindGroupNumber : bindGroupIncr, nVertexBuffers, undefined, functions
                );
                if(prepend) {
                    if(typeof prepend === 'string') shaders.fragment.code = prepend + '\n' + shaders.fragment.code;
                    else if(prepend?.fragment) {
                        shaders.fragment.code = prepend.fragment + '\n' + shaders.fragment.code;
                    }
                }
                bindGroupIncr++;
            }

            if(shaders.compute && shaders.vertex) {
                let combined = WGSLTranspiler.combineBindings(shaders.compute.code, shaders.vertex.code);
                shaders.compute.code = combined.code1;
                shaders.compute.altBindings = combined.changes1;
                shaders.vertex.code = combined.code2; //should have correlated bindings now
                shaders.vertex.altBindings = combined.changes2;
            }
            if(shaders.compute && shaders.fragment) {
                let combined = WGSLTranspiler.combineBindings(shaders.compute.code, shaders.fragment.code);
                shaders.compute.code = combined.code1;
                shaders.compute.altBindings = combined.changes1;
                shaders.fragment.code = combined.code2; //should have correlated bindings now
                shaders.fragment.altBindings = combined.changes2;
            }

            if(prevShaderCode) {
                if(typeof prevShaderCode === 'object') {
                    for(const key in prevShaderCode) {
                        let shaderContext = shaders[key];
                        if(shaderContext) {

                        }
                    }
                }
            }

            
        } else if (typeof shaderFunctions === 'function') {
            if(canvas) { //assume fragment shader (not vertex)
                shaders['fragment'] = WGSLTranspiler.convertToWebGPU(shaderFunctions, 'fragment', bindGroupLayouts.length, nVertexBuffers, undefined, functions);
            }
            else shaders['compute'] = WGSLTranspiler.convertToWebGPU(shaderFunctions, 'compute', bindGroupLayouts.length, nVertexBuffers, workGroupSize, functions); //assume compute
        }

        const shaderPipeline = await processor.init(
            shaders, 
            bindGroupLayouts, 
            device, {
                textureSettings, 
                samplerSettings, 
                nVertexBuffers, 
                contextSettings, 
                renderPipelineSettings,
                computePipelineSettings
            });

        if(inputs || renderOptions) {
            if(shaderPipeline['compute']) {
                shaderPipeline.process(...inputs);
            }
            if(shaderPipeline['fragment']) {
                let inps = inputs? [...inputs] : [] as any[];
                shaderPipeline.render({...renderOptions}, ...inps);
            }
        }

        return shaderPipeline;
    }

    cleanup = (shaderPipeline) => {
        if(shaderPipeline.device) shaderPipeline.device.destroy(); //destroys all info associated with pipelines on this device
        if(shaderPipeline.context) shaderPipeline.context.unconfigure();
    }

    combineShaderParams = (shader1Obj, shader2Obj) => {
        let combinedAst = shader2Obj.ast ? [...shader2Obj.ast] : [] as any[]; // using spread syntax to clone
        let combinedParams = shader2Obj.params ? [...shader2Obj.params] : [] as any[];
        let combinedReturnedVars = [] as any[];

        const returnMatches = shader2Obj.funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        if (returnMatches) {
            const returnedVars = returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', ''));
            combinedReturnedVars.push(...WGSLTranspiler.flattenStrings(returnedVars));
        }

        const returnMatches2 = shader1Obj.funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        if (returnMatches2) {
            const returnedVars2 = returnMatches2.map(match => match.replace(/^[ \t]*return /, '').replace(';', ''));
            combinedReturnedVars.push(...WGSLTranspiler.flattenStrings(returnedVars2));
        }

        //we are combining vertex and frag shader inputs into one long array, and updating bindings to match sequential instantiation between the vertex and frag so the binding layouts match
        if (shader1Obj.ast) combinedAst.push(...shader1Obj.ast);
        if (shader1Obj.params) combinedParams.push(...shader1Obj.params);

        // Filter out duplicate bindings and re-index the remaining ones
        const uniqueBindings = new Set();
        const updatedParams = [] as any[];
        const bindingMap2 = new Map();  // Only for fragment shader

        // Shared bindings: Make fragment shader match vertex shader
        shader1Obj.params.forEach((entry,i) => {
            if (shader2Obj.params.some(param => param.name === entry.name) && !uniqueBindings.has(entry.name)) {
                uniqueBindings.add(entry.name);
                const newBinding = i; // Keep vertex shader binding
                updatedParams.push(entry);
                bindingMap2.set(entry.binding, newBinding);  // Map fragment shader's old binding to new
            }
        });

        let maxSharedBinding = uniqueBindings.size - 1;

        // Exclusive fragment shader bindings
        shader2Obj.params.forEach((entry,i) => {
            if (!shader1Obj.params.some(param => param.name === entry.name) && !uniqueBindings.has(entry.name)) {
                uniqueBindings.add(i);
                maxSharedBinding++;
                updatedParams.push(entry);
                bindingMap2.set(entry.binding, maxSharedBinding);
            }
        });

        combinedParams = updatedParams;

        // Only update binding numbers in the shader code for fragment shader using bindingMap2
        let shaderCode2 = shader2Obj.code;
        for (let [oldBinding, newBinding] of bindingMap2.entries()) {
            const regex = new RegExp(`@binding\\(${oldBinding}\\)`, 'g');
            shaderCode2 = shaderCode2.replace(regex, `@binding(${newBinding})`);
        }
        shader2Obj.code = shaderCode2;

        shader1Obj.ast = combinedAst;
        shader1Obj.returnedVars = combinedReturnedVars;
        shader1Obj.params = combinedParams;

        shader2Obj.ast = combinedAst;
        shader2Obj.returnedVars = combinedReturnedVars;
        shader2Obj.params = combinedParams;
    }

    init = async (
        shaders:any={}, 
        bindGroupLayouts=[], 
        device=this.device,
        {
            textureSettings,
            samplerSettings,
            nVertexBuffers=1,
            contextSettings,
            renderPipelineSettings,
            computePipelineSettings
        }:any={}
    ) => {
        this.device = device;

        shaders.device = device;
        shaders.helper = this;

        shaders.addFunction = async (func) => { 
            WGSLTranspiler.addFunction(func, shaders);
            return this.init(shaders, undefined, device);
        };

        
        shaders.bindGroupLayouts = bindGroupLayouts; 
        if(this.canvas) shaders.canvas = this.canvas;
        if(this.context) shaders.context = this.context;

        for (const shaderType of ['compute','vertex','fragment']) {
            
            const shaderContext = shaders[shaderType];
            if(!shaderContext) continue;

            if(shaderContext && shaderType === 'fragment' && !shaders.vertex) {
                let vboInputStrings = [] as any[];

                let vboStrings = Array.from({length: nVertexBuffers}, (_, i) => {
                    vboInputStrings.push(
                
`@location(${4*i}) color${i>0 ? i+1 : ''}In: vec4<f32>,
    @location(${4*i+1}) vertex${i>0 ? i+1 : ''}In: vec3<f32>, 
    @location(${4*i+2}) normal${i>0 ? i+1 : ''}In: vec3<f32>,
    @location(${4*i+3}) uv${i>0 ? i+1 : ''}In: vec2<f32>${i===nVertexBuffers-1 ? '' : ','}`
                    );
                return `
    @location(${4*i}) color${i>0 ? i+1 : ''}: vec4<f32>,
    @location(${4*i+1}) vertex${i>0 ? i+1 : ''}: vec3<f32>, 
    @location(${4*i+2}) normal${i>0 ? i+1 : ''}: vec3<f32>,
    @location(${4*i+3}) uv${i>0 ? i+1 : ''}: vec2<f32>${i===nVertexBuffers-1 ? '' : ','}`;
            });

                shaders.vertex = {
                    shaders:`
struct Vertex {
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
    ${vboStrings.join('\n')}
};

@vertex
fn vtx_main(
    @builtin(vertex_index) vertexIndex : u32,   //current vertex
    @builtin(instance_index) instanceIndex: u32, //current instance
    ${vboInputStrings}
) -> Vertex {
    var pixel: Vertex;
    pixel.color = pixel.position[vertexId];
    pixel.vertex = pixel.position[vertexId];
    return pixel;
}`
                };
            } else if (shaderContext && shaderType === 'vertex' && !shaders.fragment) {
                shaders.fragment = {
                    shader:`
@fragment
fn frag_main(
    pixel: Vertex,
    @builtin(front_facing) is_front: bool,   //true when current fragment is on front-facing primitive
    @builtin(sample_index) sampleIndex: u32, //sample index for the current fragment
    @builtin(sample_mask) sampleMask: u32,   //contains a bitmask indicating which samples in this fragment are covered by the primitive being rendered
    @builtin(frag_depth) depth: f32          //Updated depth of the fragment, in the viewport depth range.
) -> @location(0) vec4<f32> {
    return pixel.color;
}`
                };
            }

            shaderContext.device = device;
        }

        if(shaders.compute) {

            shaders.compute.bindGroupLayout = shaders.device.createBindGroupLayout({
                entries:this.createBindGroupFromEntries(shaders.compute, 'compute', textureSettings, samplerSettings)
            });

            if(shaders.compute.bindGroupLayout) {
                if(typeof shaders.compute.bindGroupNumber === 'undefined') 
                    shaders.compute.bindGroupNumber = bindGroupLayouts.length; //allow incrementing bindGroupLayouts based on compute/render pairs
                bindGroupLayouts.push(shaders.compute.bindGroupLayout);
            }

        }
        
        if(shaders.vertex && shaders.fragment) {
            
            this.combineShaderParams(shaders.fragment, shaders.vertex);
            shaders.fragment.bindGroupLayout = shaders.vertex.bindGroupLayout; //keep a copy
            shaders.fragment.pipelineLayout = shaders.vertex.pipelineLayout;

            shaders.fragment.bindGroupLayout = shaders.device.createBindGroupLayout({
                entries:this.createBindGroupFromEntries(shaders.fragment, 'fragment', textureSettings, samplerSettings)
            });
            shaders.vertex.bindGroupLayout = shaders.fragment.bindGroupLayout;
            
            if(shaders.fragment.bindGroupLayout) {
                if(typeof shaders.fragment.bindGroupNumber === 'undefined') {
                    shaders.fragment.bindGroupNumber = bindGroupLayouts.length; //allow incrementing bindGroupLayouts based on compute/render pairs
                    shaders.vertex.bindGroupNumber = shaders.fragment.bindGroupNumber;
                }
                bindGroupLayouts.push(shaders.fragment.bindGroupLayout);
            }
        }

        if (shaders.vertex && shaders.fragment) { // If both vertex and fragment shaders are provided
            
            shaders.vertex.shaderModule = shaders.device.createShaderModule({
                code: shaders.vertex.code
            });

            shaders.fragment.shaderModule = shaders.device.createShaderModule({
                code: shaders.fragment.code
            });

            shaders.fragment.pipelineLayout = shaders.device.createPipelineLayout({
                bindGroupLayouts //this should have the combined compute and vertex/fragment (and accumulated) layouts
            });

            shaders.vertex.pipelineLayout = shaders.fragment.pipelineLayout;

            this.updateGraphicsPipeline(shaders, nVertexBuffers, contextSettings, renderPipelineSettings);
        } 
        if (shaders.compute) { // If it's a compute shader
            
            shaders.compute.shaderModule = shaders.device.createShaderModule({
                code: shaders.compute.code
            });

            shaders.compute.pipelineLayout = shaders.device.createPipelineLayout({
                bindGroupLayouts //this should have the combined compute and vertex/fragment (and accumulated) layouts
            });

            const pipeline = {
                layout: shaders.compute.pipelineLayout,
                compute: {
                    module: shaders.compute.shaderModule,
                    entryPoint: 'compute_main'
                }
            };

            if(computePipelineSettings) Object.assign(pipeline, computePipelineSettings); 

            shaders.compute.computePipeline = shaders.device.createComputePipeline(pipeline);


        } 
        const bIUCopy = {};
        for(const key in WGSLTranspiler.builtInUniforms) {
            bIUCopy[key] = Object.assign({},WGSLTranspiler.builtInUniforms[key]); 
        }

        //now lets bind functions to the pipeline objects. There are way cleaner ways to do this

        shaders.cleanup = () => {this.cleanup(shaders);}

        //todo: spaghetti
        for (const shaderType of ['compute','vertex','fragment']) {
            const shaderContext = shaders[shaderType]; 
            if(!shaderContext) continue;
            if(shaderType === 'compute') {
                const process = this.process.bind(shaderContext); // Bind the function to each shader object's scope, vertex and fragment share all params the way we set it up
                shaders.process = (...inputs) => { return process(undefined, shaders, ...inputs); } //compute shaders don't take the draw parameters
                
                shaderContext.buffer = this.buffer.bind(shaderContext);
                shaderContext.setBuffers = ({vbos, textures, samplerSettings, skipOutputDef}={} as any, ...inputs) => {
                    shaderContext.buffer({textures, vbos, samplerSettings, skipOutputDef}, shaders, ...inputs);
                } 
                shaderContext.getOutputData = this.getOutputData.bind(shaderContext);
                shaderContext.updateUBO = this.updateUBO.bind(shaderContext);
                // const updateVBO = this.updateVBO.bind(shaderContext);
                // shaderContext.updateVBO = updateVBO;
            }
            else if(shaderType === 'fragment') {
                const render = this.process.bind(shaderContext); // Bind the function to each shader object's scope, vertex and fragment share all params the way we set it up
                shaders.render = ({vertexCount, instanceCount, firstVertex, firstInstance, textures, samplerSettings, vbos, bufferOnly, skipOutputDef,
                    viewport,
                    scissorRect,
                    blendConstant,
                    indexBuffer,
                    indexFormat
                }={} as any, ...inputs) => {
                    render({vertexCount, instanceCount, firstVertex, firstInstance, textures, vbos, bufferOnly, skipOutputDef,
                        viewport,
                        scissorRect,
                        blendConstant,
                        indexBuffer,
                        indexFormat
                    }, shaders, ...inputs);
                }  
                const buffer = this.buffer.bind(shaderContext);   
                shaderContext.setBuffers = ({vertexCount, instanceCount, firstVertex, firstInstance, textures, samplerSettings, vertexData, skipOutputDef}={} as any, ...inputs) => {
                    buffer({vertexCount, instanceCount, firstVertex, firstInstance, textures, vertexData, samplerSettings, skipOutputDef}, shaders, ...inputs);
                } 
                shaderContext.updateGraphicsPipeline = this.updateGraphicsPipeline.bind(shaderContext);
                shaderContext.buffer = this.buffer.bind(shaderContext);
                shaderContext.updateUBO = this.updateUBO.bind(shaderContext);
                const updateVBO = this.updateVBO.bind(shaderContext);
                shaderContext.updateVBO = updateVBO;
                shaderContext.getOutputData = this.getOutputData.bind(shaderContext);
                if(shaders.vertex) {
                    const s = shaders.vertex;
                    s.updateUBO = shaderContext.updateUBO;
                    s.updateVBO = updateVBO;
                    s.render = render;
                    s.buffer = buffer;
                    s.getOutputData = shaderContext.getOutputData;
                    s.updateGraphicsPipeline = shaderContext.updateGraphicsPipeline;
                }
            } else if (shaderType === 'vertex') {
            }
            shaderContext.builtInUniforms = bIUCopy; //make a copy, should reset stuff too  
                          
            shaderContext.setUBOposition = this.setUBOposition;
            shaderContext.flattenArray = this.flattenArray;
            shaderContext.createBindGroupFromEntries = (textureSettings, samplerSettings) => {this.createBindGroupFromEntries(shaderContext, shaderType, textureSettings, samplerSettings); };
            shaderContext.combineVertices = this.combineVertices;
            shaderContext.cleanup = () => {this.cleanup(shaders);}
            if(this.canvas) shaderContext.canvas = this.canvas;
            if(this.context) shaderContext.context = this.context;
        }
        
        return shaders;
    }

    // Extract all returned variables from the function string
    createBindGroupFromEntries = (shaderContext, shaderType, textureSettings={}, samplerSettings={}, visibility=GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT) => {
        shaderContext.type = shaderType;
        let bufferIncr = 0;
        let uniformBufferIdx;

        const entries = shaderContext.params.map((node, i) => {
            let isReturned = (shaderContext.returnedVars === undefined || shaderContext.returnedVars?.includes(node.name));
            if (node.isUniform) {
                if (typeof uniformBufferIdx === 'undefined') {
                    uniformBufferIdx = i;
                    bufferIncr++;
                    return {
                        binding: uniformBufferIdx,
                        visibility,
                        buffer: {
                            type: 'uniform'
                        }
                    };
                }
                return undefined;
            } else if(node.isTexture) {
                return {
                    binding: bufferIncr,
                    visibility,
                    texture: textureSettings[node.name] ? textureSettings[node.name] : {}
                };
                bufferIncr++;
            } else if(node.isSampler) {
                return {
                    binding: bufferIncr,
                    visibility,
                    sampler: textureSettings[node.name] ? textureSettings[node.name] : {}
                };
                bufferIncr++;
            } else {
                const buffer = {
                    binding: bufferIncr,
                    visibility,
                    buffer: {
                        type: (isReturned || node.isModified) ? 'storage' : 'read-only-storage'
                    }
                };
                bufferIncr++;
                return buffer;
            }
        }).filter(v => v);

        if(shaderContext.defaultUniforms) {
            entries.push({
                binding:bufferIncr,
                visibility,
                buffer: {
                    type: 'uniform'
                }
            })
        }

        shaderContext.bindGroupLayoutEntries = entries;
        return entries;
    }

    
    updateVBO(vertices, index=0, bufferOffset=0, dataOffset=0) { //update
        
        if(vertices) {
            // 4: Create vertex buffer to contain vertex data]
        
            if(!isTypedArray(vertices)) {
                if(!Array.isArray(vertices)) {
                    vertices = this.combineVertices(
                        typeof vertices.color?.[0] === 'object' ? this.flattenArray(vertices.color) : vertices.color,
                        typeof vertices.position?.[0] === 'object' ? this.flattenArray(vertices.position) : vertices.position,
                        typeof vertices.normal?.[0] === 'object' ? this.flattenArray(vertices.normal) : vertices.normal,
                        typeof vertices.uv?.[0] === 'object' ? this.flattenArray(vertices.uv) : vertices.uv
                    );
                }
                else vertices = new Float32Array(typeof vertices === 'object' ? this.flattenArray(vertices) : vertices);
            }
            if(!this.vertexBuffers || this.vertexBuffers[index]?.size !== vertices.byteLength) {
                if(!this.vertexBuffers) this.vertexBuffers = [] as any[];
                const vertexBuffer = this.device.createBuffer({
                    size: vertices.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, //assume read/write
                });

                this.vertexBuffers[index] = vertexBuffer; //todo: generalize e.g. shaders.vertexBuffers[n]

            }

            if(!this.vertexCount) this.vertexCount = vertices.length / 12;

            // Copy the vertex data over to the GPUBuffer using the writeBuffer() utility function
            this.device.queue.writeBuffer(this.vertexBuffers[index], bufferOffset, vertices, dataOffset, vertices.length);
        }
    }

    updateGraphicsPipeline(shaders, nVertexBuffers, contextSettings, renderPipelineSettings) {

        // Setup render outputs
        const swapChainFormat = navigator.gpu.getPreferredCanvasFormat();

        this.context?.configure(contextSettings ? contextSettings : {
            device: shaders.device, 
            format: swapChainFormat, 
            //usage: GPUTextureUsage.RENDER_ATTACHMENT,
            alphaMode: 'premultiplied'
        });

        //allows 3D rendering
        const depthFormat = "depth24plus";
        const depthTexture = this.device.createTexture({
            size: {width: this.canvas.width, height: this.canvas.height},
            format: depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        // 5: Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
        const vertexBuffers = Array.from({length:nVertexBuffers}, (_,i) => {return {
            arrayStride: 48,
            attributes: [
                {format: "float32x4", offset: 0, shaderLocation:  4*i},     //color
                {format: "float32x3", offset: 16, shaderLocation: 4*i+1},   //position
                {format: "float32x3", offset: 28, shaderLocation: 4*i+2},   //normal
                {format: "float32x2", offset: 40, shaderLocation: 4*i+3}    //uv
            ]
        }});

        const pipeline = { //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
            layout: shaders.fragment.pipelineLayout,
            vertex: {
                module: shaders.vertex.shaderModule,
                entryPoint: 'vtx_main',
                buffers: vertexBuffers
            },
            fragment: {
                module: shaders.fragment.shaderModule,
                entryPoint: 'frag_main',
                targets: [{
                    format: swapChainFormat
                }]
            },
            depthStencil: {format: depthFormat, depthWriteEnabled: true, depthCompare: "less"}
        };

        if(renderPipelineSettings) Object.assign(pipeline,renderPipelineSettings);

        shaders.vertex.graphicsPipeline = this.device.createRenderPipeline(pipeline);
        shaders.fragment.graphicsPipeline = shaders.vertex.graphicsPipeline;
        
        // const canvasView = this.device.createTexture({
        //     size: [this.canvas.width, this.canvas.height],
        //     sampleCount:4,
        //     format: navigator.gpu.getPreferredCanvasFormat(),
        //     usage: GPUTextureUsage.RENDER_ATTACHMENT,
        // });

        const view = this.context.getCurrentTexture().createView();

        const renderPassDescriptor = { //some assumptions
            colorAttachments: [{
                view: view,
                loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "store"
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
                //stencilLoadOp: "clear",
                //stencilClearValue: 0,
                //stencilStoreOp: "store"
            }
        };

        shaders.vertex.renderPassDescriptor = renderPassDescriptor;
        shaders.fragment.renderPassDescriptor = renderPassDescriptor;

        return shaders;
    }
    
    flattenArray(arr) {
        let result = [] as any[];
        for (let i = 0; i < arr.length; i++) {
            if (Array.isArray(arr[i])) {
                result = result.concat(this.flattenArray(isTypedArray(arr[i]) ? Array.from(arr[i]) : arr[i]));
            } else {
                result.push(arr[i]);
            }
        }
        return result;
    }

    combineVertices(
        colors,    //4d vec array
        positions, //3d vec array
        normal,   //3d vec array
        uvs        //2d vec array
    ) {
        let length = 0;
        if(colors) length = colors.length / 4; 
        if (positions?.length > length) length = positions.length / 3;
        if (normal?.length > length) length = normal.length / 3;
        if (uvs?.length > length) length = uvs.length / 2;
        const vertexCount = length; // Assuming each position has 3 components
        const interleavedVertices = new Float32Array(vertexCount * 12); // 12 values per vertex

        for (let i = 0; i < vertexCount; i++) {
            const posOffset = i * 3;
            const colOffset = i * 4;
            const norOffset = i * 3;
            const uvOffset = i * 2;
            const interleavedOffset = i * 12;

            interleavedVertices[interleavedOffset] = colors ? colors[colOffset] || 0 : 0;
            interleavedVertices[interleavedOffset + 1] = colors ? colors[colOffset + 1] || 0 : 0;
            interleavedVertices[interleavedOffset + 2] = colors ? colors[colOffset + 2] || 0 : 0;
            interleavedVertices[interleavedOffset + 3] = colors ? colors[colOffset + 3] || 0 : 0;
            interleavedVertices[interleavedOffset + 4] = positions ? positions[posOffset] || 0 : 0;
            interleavedVertices[interleavedOffset + 5] = positions ? positions[posOffset + 1] || 0 : 0;
            interleavedVertices[interleavedOffset + 6] = positions ? positions[posOffset + 2] || 0 : 0;
            interleavedVertices[interleavedOffset + 7] = normal ? normal[norOffset] || 0 : 0;
            interleavedVertices[interleavedOffset + 8] = normal ? normal[norOffset + 1] || 0 : 0;
            interleavedVertices[interleavedOffset + 9] = normal ? normal[norOffset + 2] || 0 : 0;
            interleavedVertices[interleavedOffset + 10] = uvs ? uvs[uvOffset] || 0 : 0;
            interleavedVertices[interleavedOffset + 11] = uvs ? uvs[uvOffset + 1] || 0 : 0;
        }

        return interleavedVertices;
    }

    static splitVertices(interleavedVertices) {
        const vertexCount = interleavedVertices.length / 12;  // Because 12 values per vertex

        // Pre-allocating space
        const colors = new Float32Array(vertexCount * 4);
        const positions = new Float32Array(vertexCount * 3);
        const normal = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);

        for (let i = 0; i < vertexCount; i++) {
            const offset = i * 12;
            const posOffset = i * 3;
            const colOffset = i * 4;
            const norOffset = i * 3;
            const uvOffset = i * 2;

            colors[colOffset] = interleavedVertices[offset];
            colors[colOffset + 1] = interleavedVertices[offset + 1];
            colors[colOffset + 2] = interleavedVertices[offset + 2];
            colors[colOffset + 3] = interleavedVertices[offset + 3];

            positions[posOffset] = interleavedVertices[offset + 4];
            positions[posOffset + 1] = interleavedVertices[offset + 5];
            positions[posOffset + 2] = interleavedVertices[offset + 6];

            normal[norOffset] = interleavedVertices[offset + 7];
            normal[norOffset + 1] = interleavedVertices[offset + 8];
            normal[norOffset + 2] = interleavedVertices[offset + 9];

            uvs[uvOffset] = interleavedVertices[offset + 10];
            uvs[uvOffset + 1] = interleavedVertices[offset + 11];
        }

        return {
            positions,
            colors,
            normal,
            uvs
        };
    }


    setUBOposition(dataView, inputTypes, typeInfo, offset, input, inpIdx) { //utility function, should clean up later (i.e. provide the values instead of objects to reference)
        // Ensure the offset is aligned correctly
        offset = Math.ceil(offset / typeInfo.alignment) * typeInfo.alignment;
        if(input !== undefined) {
            if (inputTypes[inpIdx].type.startsWith('vec')) {
                const vecSize = typeInfo.size / 4;
                for (let j = 0; j < vecSize; j++) {
                    //console.log(dataView,offset + j * 4)
                    if(inputTypes[inpIdx].type.includes('f')) dataView.setFloat32(offset + j * 4, input[j], true);
                    else dataView.setInt32(offset + j * 4, input[j], true);
                }
            } else if (inputTypes[inpIdx].type.startsWith('mat')) {
                const flatMatrix = typeof input[0] === 'object' ? this.flattenArray(input) : input;
                for (let j = 0; j < flatMatrix.length; j++) {
                    dataView.setFloat32(offset + j * 4, flatMatrix[j], true); //we don't have Float16 in javascript :-\
                }
            } else{
                switch (inputTypes[inpIdx].type) {
                    case 'f32':
                        dataView.setFloat32(offset, input, true); // true for little-endian
                        break;
                    case 'i32':
                        dataView.setInt32(offset, input, true); // true for little-endian
                        break;
                    case 'u32':
                        dataView.setUInt32(offset, input, true); // true for little-endian 
                        break;
                    case 'f16':
                        dataView.setFloat16(offset, input, true); // true for little-endian
                        break;
                    case 'i16':
                        dataView.setInt16(offset, input, true); // true for little-endian
                        break;
                    case 'u16':
                        dataView.setUInt16(offset, input, true); // true for little-endian 
                        break;
                    case 'i8':
                        dataView.setInt8(offset, input, true); // true for little-endian 
                        break;
                    case 'u8':
                        dataView.setUInt8(offset, input, true); // true for little-endian 
                        break;
                }
            }
        }
        offset += typeInfo.size; // Increment the offset by the size of the type
        return offset;
    }

    updateUBO(inputs, inputTypes) {
        if(!inputs) return;
        if(this.uniformBuffer) { //update custom uniforms
            // Use a DataView to set values at specific byte offsets
            const dataView = new DataView(this.uniformBuffer.getMappedRange()); //little endian
    
            let offset = 0; // Initialize the offset
            let inpIdx = 0;
            this.params.forEach((node, i) => {
                if(node.isUniform) {
                    let input;
                    if(Array.isArray(inputs)) input = inputs[inpIdx];
                    else input = inputs?.[node.name];
                    if(typeof input === 'undefined' && typeof this.uniformBufferInputs?.[inpIdx] !== 'undefined') input = this.uniformBufferInputs[inpIdx]; //save data
                    
                        
                    const typeInfo = WGSLTypeSizes[inputTypes[inpIdx].type];

                    if(!this.uniformBufferInputs) {
                        this.uniformBufferInputs = {};
                    } this.uniformBufferInputs[inpIdx] = input;

                    offset = this.setUBOposition(dataView, inputTypes, typeInfo, offset, input, inpIdx);
                }
                if(node.isInput) inpIdx++;
            });

            // if(this.defaultUniforms) {
            //     values.forEach((v,i) => {
            //         const typeInfo = wgslTypeSizes[this.builtInUniforms[this.defaultUniforms[i]].type];
    
            //         offset = this.setUBOposition(dataView,inputTypes,typeInfo,offset,v,i);
            //     })
            // }
            this.uniformBuffer.unmap();
        }

        if(this.defaultUniforms) { //update built-in uniforms (you can add whatever you want to the builtInUniforms list)
            // Use a DataView to set values at specific byte offsets
            const dataView = new DataView(this.defaultUniformBuffer.getMappedRange()); //little endian
            let offset = 0; // Initialize the offset

            this.defaultUniforms.forEach((u,i) => { 
                let value = this.builtInUniforms[u]?.callback(this);
                const typeInfo = WGSLTypeSizes[this.builtInUniforms[this.defaultUniforms[i]].type];
                offset = this.setUBOposition(dataView,inputTypes,typeInfo,offset,value,i);
            });

            this.defaultUniformBuffer.unmap();
        }
    }

    buffer(
        { 
            vbos,  //[{vertices:[]}]
            textures, //[{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }], //all required
            samplerSettings,
            skipOutputDef
        }={} as any, 
        shaders, 
        ...inputs
    ) {
        if(vbos) { //todo: we should make a robust way to set multiple inputs on bindings
            vbos.forEach((vertices,i) => {
                this.updateVBO(vertices, i)
            });
        }
        
        if(!this.inputTypes) this.inputTypes = this.params.map((p) => {
            let type = p.type;
            if(type.startsWith('array')) {
                type = type.substring(6,type.length-1) //cut off array<  >
            }
            return WGSLTypeSizes[type];
        });

        const inputTypes = this.inputTypes;
        let newInputBuffer = false;
        if(this.inputBuffers) {
            inputs.forEach((inp,index) => {
                if(inp && inp?.length) {
                    if(this.inputBuffers[index].byteLength !== inp.length * inputTypes[index].byteSize) {
                        newInputBuffer = true;
                    }
                }
            });
        } else newInputBuffer = true; //will trigger bindGroups to be set
        
        // Create or recreate input buffers      // Extract all returned variables from the function string
        // Separate input and output AST nodes
        if(!this.textures) {
            this.textures = {};
            this.samplers = {};
        }
        if(!this.inputBuffers) {
            const bufferGroup = {} as any;

            this.inputBuffers = [] as any[];
            this.uniformBuffer = undefined;
            this.outputBuffers = [] as any[];

            bufferGroup.inputBuffers = this.inputBuffers;
            bufferGroup.outputBuffers = this.outputBuffers;
            bufferGroup.textures = this.textures;
            bufferGroup.samplers = this.samplers;

            this.bufferGroup = bufferGroup; //more tidy reference

            if(!shaders.bufferGroups) shaders.bufferGroups = new Array(2);
            shaders.bufferGroups[this.computePipeline ? 0 : 1] = bufferGroup;
        }

        let uBufferPushed = false;
        let inpBuf_i = 0; let inpIdx = 0;
        let hasUniformBuffer = 0;
        let uBufferCreated = false;
        let textureIncr = 0;
        let samplerIncr = 0;

        let bindGroupAlts = [] as any[];
        let uniformValues = [] as any[];
        let hasTextureBuffers = false;
        for(let i = 0; i < this.params.length; i++ ) {
            const node = this.params[i];
            if(typeof inputs[inpBuf_i] !== 'undefined' && this.altBindings?.[node.name] && this.altBindings?.[node.name].group !== this.bindGroupNumber) {
                if(!bindGroupAlts[this.altBindings?.[node.name].group]) {
                    if(bindGroupAlts[this.altBindings?.[node.name].group].length < this.altBindings?.[node.name].group) bindGroupAlts[this.altBindings?.[node.name].group].length = this.altBindings?.[node.name].group+1; 
                    bindGroupAlts[this.altBindings?.[node.name].group] = [] as any[];
                }
                if(!bindGroupAlts[this.altBindings?.[node.name].group].length >= this.altBindings?.[node.name].group) bindGroupAlts[this.altBindings?.[node.name].group].length = this.altBindings?.[node.name].group+1;
                bindGroupAlts[this.altBindings?.[node.name].group][this.altBindings?.[node.name].group] = inputs[i];
            }
            else if(node.isTexture) {
                const texture = textures?.[textureIncr] ? textures?.[textureIncr] : textures?.[node.name];
                if(texture) {
                    this.textures[node.name] = this.device.createTexture({
                        label:texture.label ? texture.label :`texture_g${this.bindGroupNumber}_b${i}`,
                        format:texture.format ? texture.format : 'rgba8unorm',
                        size: [texture.width, texture.height],
                        usage: texture.usage ? texture.usage : (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUBufferUsage.COPY_SRC) //assume read/write (e.g. transforming a texture and returning it)
                    });

                    this.device.queue.writeTexture(
                        { texture:texture.data },
                        this.textures[node.name],
                        { bytesPerRow: texture[textureIncr].width * 4 },
                        { width: texture[textureIncr].width, height: texture[textureIncr].height },
                    );
                    
                    hasTextureBuffers = true; //we need to update the bindGroupLayout and pipelines accordingly
                }
                textureIncr++;
            } else if (node.isSampler) {
                const sampler = this.samplers[node.name];
                if(!sampler) {
                    this.samplers[node.name] = this.device.createSampler(
                        samplerSettings ? (samplerSettings?.[node.name] ? samplerSettings[node.name] : samplerSettings) : {
                            magFilter: "linear",
                            minFilter: "linear",
                            mipmapFilter: "linear",
                            addressModeU: "repeat",
                            addressModeV: "repeat",
                        }
                    );
                }
                samplerIncr++;
            } else {
                if(node.isUniform) {
                    if(inputs[inpIdx] !== undefined) 
                        uniformValues[inpIdx] = inputs[inpIdx];
                    // Assuming you've determined the total size of the uniform buffer beforehand
                    if (!this.uniformBuffer || (!uBufferCreated && inputs[inpBuf_i] !== undefined)) {

                        if(!this.totalUniformBufferSize) {
                            let totalUniformBufferSize = 0;
                            this.params.forEach((node,j) => {
                                if(node.isInput && node.isUniform){
                                    if(inputTypes[j]) {
                                        let size; 
                                        if(inputs[inpBuf_i]?.byteLength) size = inputs[inpBuf_i].byteLength;
                                        else if (inputs[inpBuf_i]?.length) size = 4 * inputs[inpBuf_i].length;
                                        else size = inputTypes[j].size;
                                        totalUniformBufferSize += inputTypes[j].size;
                                        if(totalUniformBufferSize % 8 !== 0) 
                                            totalUniformBufferSize += WGSLTypeSizes[inputTypes[j].type].alignment;
                                    }
                                }
                            }); 

                            // if(this.defaultUniforms) {
                            //     this.defaultUniforms.forEach((u) => {
                            //         totalUniformBufferSize += wgslTypeSizes[this.builtInUniforms[u].type].size; //assume 4 bytes per float/int (32 bit)
                            //     });
                            // }

                            if(totalUniformBufferSize < 8) totalUniformBufferSize += 8 - totalUniformBufferSize; 
                            else totalUniformBufferSize -= totalUniformBufferSize % 16; //correct final buffer size (IDK)

                            this.totalUniformBufferSize = totalUniformBufferSize;
                        }

                        this.uniformBuffer = this.device.createBuffer({
                            size: this.totalUniformBufferSize ? this.totalUniformBufferSize : 8, // This should be the sum of byte sizes of all uniforms
                            usage: GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_SRC,
                            mappedAtCreation:true
                        });
                        
                        this.inputBuffers[inpBuf_i] = (this.uniformBuffer);
                        this.bufferGroup.uniformBuffer = this.uniformBuffer;
                        uBufferCreated = true;
                    }
                    if(!hasUniformBuffer) {
                        hasUniformBuffer = 1;
                        inpBuf_i++;
                    }
                    inpIdx++;
                }
                // Create or recreate input buffers
                else {
                    //I guess we need to make a new buffer every time we want to write new data
                    if (typeof inputs[inpBuf_i] !== 'undefined' || !this.inputBuffers[inpBuf_i]) {
                        
                        if(!inputs?.[inpBuf_i]?.byteLength && Array.isArray(inputs[inpBuf_i]?.[0])) inputs[inpBuf_i] = this.flattenArray(inputs[inpBuf_i]);
                        
                        this.inputBuffers[inpBuf_i] = (
                            this.device.createBuffer({
                                size:  inputs[inpBuf_i] ? (inputs[inpBuf_i].byteLength ? inputs[inpBuf_i].byteLength : inputs[inpBuf_i]?.length ? inputs[inpBuf_i].length*4 : 8) : 8,
                                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                                mappedAtCreation: true
                            })  
                        );

                        new Float32Array(this.inputBuffers[inpBuf_i].getMappedRange()).set(inputs[inpBuf_i]);
                    
                        this.inputBuffers[inpBuf_i].unmap();
                    }

                    inpBuf_i++;
                    inpIdx++;
                }

                //set output buffers
                if(!skipOutputDef && node.isReturned && (!node.isUniform || (node.isUniform && !uBufferPushed))) {
                    // Create or recreate the output buffers for all returned variables
                    if(!node.isUniform) {
                        this.outputBuffers[inpBuf_i-1] = (this.inputBuffers[inpBuf_i-1]);
                    } else if(!uBufferPushed) {
                        uBufferPushed = true;
                        this.outputBuffers[inpBuf_i-1] = (this.uniformBuffer);
                    }
                }
            }
        };

        //run the buffer() call now for each group tied to each shader based on load order
        bindGroupAlts.forEach((inp,i) => {
            if(typeof inp !== 'undefined') {
                Object.entries(shaders).find((obj:any) => {
                    if(obj.bindGroupNumber === i) {
                        obj.buffer({vbos,textures,samplerSettings},...inp);
                        return true;
                    }
                });
            }  
        })
                                    
        if(this.defaultUniforms) {  //make new buffer each input
            
            if(!this.totalDefaultUniformBufferSize) {
                let totalUniformBufferSize = 0;
                this.defaultUniforms.forEach((u) => {
                    totalUniformBufferSize += WGSLTypeSizes[this.builtInUniforms[u].type].size; //assume 4 bytes per float/int (32 bit)
                });

                if(totalUniformBufferSize < 8) totalUniformBufferSize += 8 - totalUniformBufferSize; 
                else totalUniformBufferSize -= totalUniformBufferSize % 16; //correct final buffer size (I think)

                this.totalDefaultUniformBufferSize = totalUniformBufferSize;
                    
            }                           

            this.defaultUniformBuffer = this.device.createBuffer({
                size: this.totalDefaultUniformBufferSize, // This should be the sum of byte sizes of all uniforms
                usage: GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_SRC,
                mappedAtCreation:true
            });

            if(!this.defaultUniformBinding) {
                this.defaultUniformBinding = this.inputBuffers.length; //latest binding in series
            }
            this.bufferGroup.defaultUniformBuffer = this.defaultUniformBuffer;
        }
        
        this.updateUBO(uniformValues, inputTypes);

        if(newInputBuffer) {
            // Update bind group creation to include both input and output buffers
            const bindGroupEntries = this.inputBuffers.map((buffer, index) => ({
                binding: index,
                resource: { buffer }
            })); //we are inferring outputBuffers from inputBuffers
            
            if(this.defaultUniforms) bindGroupEntries.push({
                binding: this.defaultUniformBinding, 
                resource: {buffer:this.defaultUniformBuffer}
            });

            this.bindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: bindGroupEntries
            });

            if(!shaders.bindGroups) shaders.bindGroups = [] as any[];
            shaders.bindGroups[this.bindGroupNumber] = this.bindGroup;
        }

        return newInputBuffer;
        
    }

    getOutputData(commandEncoder) {
        //Return one or multiple results

        // Create staging buffers for all output buffers
        const stagingBuffers = this.outputBuffers.map(outputBuffer => {
            return this.device.createBuffer({
                size: outputBuffer.size,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
            });
        });

        // Copy data from each output buffer to its corresponding staging buffer
        this.outputBuffers.forEach((outputBuffer, index) => {
            commandEncoder.copyBufferToBuffer(
                outputBuffer, 0,
                stagingBuffers[index], 0,
                outputBuffer.size
            );
        });

        this.device.queue.submit([commandEncoder.finish()]);

        const promises = stagingBuffers.map(buffer => {
            return new Promise((resolve) => {
                buffer.mapAsync(GPUMapMode.READ).then(() => {
                    const mappedRange = buffer.getMappedRange();
                    const rawResults = new Float32Array(mappedRange); 
                    const copiedResults = new Float32Array(rawResults.length);
                    
                    copiedResults.set(rawResults); // Fast copy
                    buffer.unmap();
                    resolve(copiedResults);
                });
            });
        });

        return promises.length === 1 ? promises[0] : Promise.all(promises);
     
    }

    //bound to the shader scope. Todo: make this more robust for passing values for specific vertexbuffers or say texturebuffers etc
    process({
        //todo:cleanup
        vertexCount, //collapse into vertexData sets
        instanceCount, 
        firstVertex, 
        firstInstance, 
        vbos,  //[{vertices:[]}]
        textures, //[{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }], //all required
        bufferOnly,
        skipOutputDef,
        samplerSettings,
        viewport,
        scissorRect,
        blendConstant,
        indexBuffer,
        firstIndex,
        indexFormat, //uint16 or uint32
        useRenderBundle,
        workgroupsX,workgroupsY,workgroupsZ
    }={} as any, shaders, 
    ...inputs
) {

        const newInputBuffer = this.buffer(
            {
                vbos,  //[{vertices:[]}]
                textures, //[{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }], //all required
                skipOutputDef,
                samplerSettings
            }, shaders, ...inputs
        );

        if(!bufferOnly) { //todo: combine more shaders
            const commandEncoder = this.device.createCommandEncoder();
            if (this.computePipeline) { // If compute pipeline is defined
                const computePass = commandEncoder.beginComputePass();
                computePass.setPipeline(this.computePipeline);

                shaders.bindGroups.forEach((group,i) => {
                    computePass.setBindGroup(i,group);
                });

                let wX = workgroupsX ? workgroupsX : 
                this.inputBuffers?.[0] ? (this.inputBuffers[0].size/4) / this.workGroupSize : 1;
                computePass.dispatchWorkgroups(wX, workgroupsY, workgroupsZ); 
                computePass.end();

            } 
            if (this.graphicsPipeline) { // If graphics pipeline is defined

                let renderPass;
                //faster repeat calls with useRenderBundle if input array buffers don't change size and are instead simply written to when needed. Our system handles the sizing and writing for us
                if(useRenderBundle && (newInputBuffer || !this.renderBundle)) { 
                    //record a render pass
                    renderPass = this.device.createRenderBundleEncoder({
                        colorFormat: [navigator.gpu.getPreferredCanvasFormat()],
                        //depthStencilFormat: "depth24plus" //etc...
                    });
                    this.firstPass = true;
                } else {
                    this.renderPassDescriptor.colorAttachments[0].view = this.context
                        .getCurrentTexture()
                        .createView();
                    renderPass = commandEncoder.beginRenderPass(this.renderPassDescriptor);
                }
                
                
                if(!useRenderBundle || !this.renderBundle) { //drawIndirect?
                    renderPass.setPipeline(this.graphicsPipeline);
                    
                    shaders.bindGroups.forEach((group,i) => {
                        renderPass.setBindGroup(i,group);
                    });
                    
                    if(!this.vertexBuffers) this.updateVBO({color:[1,1,1,1]}, 0); //put a default in to force it to run a single pass
                    
                    if(this.vertexBuffers) 
                        this.vertexBuffers.forEach((vbo,i) => {renderPass.setVertexBuffer(i, vbo)});
                    
                    if(viewport) {
                        renderPass.setViewPort(
                            viewport.x, viewport.y, viewport.width, viewport.height, viewport.minDepth, viewport.maxDepth
                        )
                    }

                    if(scissorRect) {
                        renderPass.setScissorRect(
                            scissorRect.x, scissorRect.y, scissorRect.width, scissorRect.height
                        )
                    }

                    if(blendConstant) {
                        renderPass.setBlendConstant(
                            blendConstant
                        )
                    }

                    if(indexBuffer || this.indexBuffer) {
                        if(indexBuffer) this.indexBuffer = indexBuffer;
                        if(!this.indexFormat) this.indexFormat = indexFormat ? indexFormat : "uint32";
                        renderPass.setIndexBuffer(this.indexBuffer, this.indexFormat);
                    }

                    
                    if(vertexCount) this.vertexCount = vertexCount;
                    else if(!this.vertexCount) this.vertexCount = 1;
                    if(this.indexBuffer) renderPass.drawIndexed(this.vertexCount ? this.vertexCount : 1, instanceCount, firstIndex, 0, firstInstance)
                    else renderPass.draw(this.vertexCount ? this.vertexCount : 1, instanceCount, firstVertex, firstInstance);

                    if(useRenderBundle && this.firstPass) this.renderBundle = renderPass.finish(); //replace the encoder with the recording
                } else {
                    renderPass.executeBundles([this.renderBundle]);
                }
                renderPass.end();

            }

            if(!skipOutputDef) {
                return this.getOutputData(commandEncoder);
            } else return new Promise((r) => r(true));
            
        }
        
    }

}



      
function isTypedArray(x) { //https://stackoverflow.com/a/40319428
    return (ArrayBuffer.isView(x) && Object.prototype.toString.call(x) !== "[object DataView]");
}
