export class WebGPUjs {

    //This spec is changing so our workflow and regex might need to be maintained
    //https://gpuweb.github.io/gpuweb/#gpu-interface
    //https://webgpufundamentals.org/
    //https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

    //todo: 
    // - typescript
    // - more shadertoy features, like more anticipated buffer inputs (e.g. mouse, audio) with some automated ways to get the data into the shader. We added a few to get started
    // - combining more shader bindings at will
    // Examples/tests todo: return types, not returning, render, compute + render, compute + compute + render, video texture example (https://webgpu.github.io/webgpu-samples/samples/videoUploading#../../shaders/fullscreenTexturedQuad.wgsl)
    // - whatever else seems important in the wgsl spec. e.g. https://developer.mozilla.org/en-US/docs/Web/API/GPURenderBundle
    // - we could generalze the shader object keys more so it's not just compute/fragment/vertex names
    
    //specifics to be customized: (make a shader class)
    // - shader code obv
    // - render pass descriptor
    // - bind group entries
    // - textureSettings, 
    // - samplerSettings, 
    // - nVertexBuffers, 
    // - contextSettings, 
    // - renderPipelineSettings,
    // - computePipelineSettings


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
       }={}
    ) => {
        if(!bindGroupLayouts) bindGroupLayouts = [];
        if (!device) {
            const gpu = navigator.gpu;
            const adapter = await gpu.requestAdapter();
            device = await adapter.requestDevice();
        }
        const processor = new WebGPUjs();

        if(functions) processor.functions = functions;
        
        if(canvas) {
            processor.canvas = canvas;
            if(!context) context = canvas.getContext('webgpu');
            processor.context = context;
        }

        //Todo: combine bindings, remap buffer inputs in process()
        const shaders = {};
        if (typeof shaderFunctions === 'object') { // Check if shaders are provided as an object

            let bindGroupIncr=bindGroupLayouts.length;
            
            //we are parsing all of the bindings and stuff from the conversion process, so this won't render straight shader code
            if (shaderFunctions.compute) {
                shaders.compute = processor.convertToWebGPU(
                    shaderFunctions.compute, 'compute', shaders.compute?.bindGroupNumber ? shaders.compute.bindGroupNumber : bindGroupIncr, nVertexBuffers, workGroupSize
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
                shaders.vertex = processor.convertToWebGPU(
                    shaderFunctions.vertex, 'vertex', shaders.vertex?.bindGroupNumber ? shaders.vertex.bindGroupNumber : bindGroupIncr, nVertexBuffers
                );
                if(prepend) {
                    if(typeof prepend === 'string') shaders.vertex.code = prepend + '\n' + shaders.vertex.code;
                    else if(prepend?.vertex) {
                        shaders.vertex.code = prepend.vertex + '\n' + shaders.vertex.code;
                    }
                }
            }  
            if (shaderFunctions.fragment) {
                shaders.fragment = processor.convertToWebGPU(
                    shaderFunctions.fragment, 'fragment', shaders.fragment?.bindGroupNumber ? shaders.fragment.bindGroupNumber : bindGroupIncr, nVertexBuffers
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
                let combined = processor.combineBindings(shaders.compute.code, shaders.vertex.code);
                shaders.compute.code = combined.code1;
                shaders.compute.altBindings = combined.changes1;
                shaders.vertex.code = combined.code2; //should have correlated bindings now
                shaders.vertex.altBindings = combined.changes2;
            }
            if(shaders.compute && shaders.fragment) {
                let combined = processor.combineBindings(shaders.compute.code, shaders.fragment.code);
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
                shaders['fragment'] = processor.convertToWebGPU(shaderFunctions, 'fragment', bindGroupLayouts.length, nVertexBuffers);
            }
            else shaders['compute'] = processor.convertToWebGPU(shaderFunctions, 'compute', bindGroupLayouts.length, nVertexBuffers); //assume compute
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
                let inps = inputs? [...inputs] : [];
                shaderPipeline.render({...renderOptions}, ...inps);
            }
        }

        return shaderPipeline;
    }

    cleanup = (shaderPipeline) => {
        if(shaderPipeline.device) shaderPipeline.device.destroy(); //destroys all info associated with pipelines on this device
        if(shaderPipeline.context) shaderPipeline.context.unconfigure();
    }

    init = async (
        shaders={'compute':{shader,ast,params,funcStr,defaultUniforms}}, 
        bindGroupLayouts=[], 
        device=this.device,
        {
            textureSettings,
            samplerSettings,
            nVertexBuffers=1,
            contextSettings,
            renderPipelineSettings,
            computePipelineSettings
        }={}
    ) => {
        this.device = device;

        shaders.device = device;
        shaders.helper = this;

        shaders.addFunction = async (func) => { 
            return this.addFunction(func, shaders);
        };

        const combineShaderParams = (shader1Obj, shader2Obj) => {
            let combinedAst = shader2Obj.ast ? [...shader2Obj.ast] : []; // using spread syntax to clone
            let combinedParams = shader2Obj.params ? [...shader2Obj.params] : [];
            let combinedReturnedVars = [];

            const returnMatches = shader2Obj.funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
            if (returnMatches) {
                const returnedVars = returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', ''));
                combinedReturnedVars.push(...this.flattenStrings(returnedVars));
            }

            const returnMatches2 = shader1Obj.funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
            if (returnMatches2) {
                const returnedVars2 = returnMatches2.map(match => match.replace(/^[ \t]*return /, '').replace(';', ''));
                combinedReturnedVars.push(...this.flattenStrings(returnedVars2));
            }

            //we are combining vertex and frag shader inputs into one long array, and updating bindings to match sequential instantiation between the vertex and frag so the binding layouts match
            if (shader1Obj.ast) combinedAst.push(...shader1Obj.ast);
            if (shader1Obj.params) combinedParams.push(...shader1Obj.params);

            // Filter out duplicate bindings and re-index the remaining ones
            const uniqueBindings = new Set();
            const updatedParams = [];
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

        shaders.bindGroupLayouts = bindGroupLayouts; 
        if(this.canvas) shaders.canvas = this.canvas;
        if(this.context) shaders.context = this.context;

        for (const shaderType of ['compute','vertex','fragment']) {
            
            const shaderContext = shaders[shaderType];
            if(!shaderContext) continue;

            if(shaderContext && shaderType === 'fragment' && !shaders.vertex) {
                let vboInputStrings = [];

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

                const vtxInps = `
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
    ${vboStrings.join('\n')}`;

                shaders.vertex = {
                    shaders:`
struct Vertex {
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
    ${vtxInps.join('\n')}
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

            shaders.compute.bindGroupLayout = this.device.createBindGroupLayout({
                entries:this.createBindGroupFromEntries(shaders.compute, 'compute', textureSettings, samplerSettings)
            });

            if(shaders.compute.bindGroupLayout) {
                if(typeof shaders.compute.bindGroupNumber === 'undefined') 
                    shaders.compute.bindGroupNumber = bindGroupLayouts.length; //allow incrementing bindGroupLayouts based on compute/render pairs
                bindGroupLayouts.push(shaders.compute.bindGroupLayout);
            }

        }
        if(shaders.vertex && shaders.fragment) {
            
            combineShaderParams(shaders.fragment, shaders.vertex);
            shaders.fragment.bindGroupLayout = shaders.vertex.bindGroupLayout; //keep a copy
            shaders.fragment.pipelineLayout = shaders.vertex.pipelineLayout;

            shaders.fragment.bindGroupLayout = this.device.createBindGroupLayout({
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
            
            shaders.vertex.shaderModule = this.device.createShaderModule({
                code: shaders.vertex.code
            });

            shaders.fragment.shaderModule = this.device.createShaderModule({
                code: shaders.fragment.code
            });

            shaders.fragment.pipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts //this should have the combined compute and vertex/fragment (and accumulated) layouts
            });

            shaders.vertex.pipelineLayout = shaders.fragment.pipelineLayout;

            this.updateGraphicsPipeline(shaders, nVertexBuffers, contextSettings, renderPipelineSettings);
        } 
        if (shaders.compute) { // If it's a compute shader
            
            shaders.compute.shaderModule = this.device.createShaderModule({
                code: shaders.compute.code
            });

            shaders.compute.pipelineLayout = this.device.createPipelineLayout({
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

            shaders.compute.computePipeline = this.device.createComputePipeline(pipeline);


        } 
        const bIUCopy = {};
        for(const key in this.builtInUniforms) {
            bIUCopy[key] = Object.assign({},this.builtInUniforms[key]); 
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
                shaderContext.setBuffers = ({vbos, textures, samplerSettings, skipOutputDef}={}, ...inputs) => {
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
                }={}, ...inputs) => {
                    render({vertexCount, instanceCount, firstVertex, firstInstance, textures, vbos, bufferOnly, skipOutputDef,
                        viewport,
                        scissorRect,
                        blendConstant,
                        indexBuffer,
                        indexFormat
                    }, shaders, ...inputs);
                }  
                const buffer = this.buffer.bind(shaderContext);   
                shaderContext.setBuffers = ({vertexCount, instanceCount, firstVertex, firstInstance, textures, samplerSettings, vertexData, skipOutputDef}={}, ...inputs) => {
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
                if(!this.vertexBuffers) this.vertexBuffers = [];
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
        let result = [];
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

    //some default uniforms we can add by simply referencing these variable names to pull the relevant data on a callback
    //will default to canvas then window for 
    builtInUniforms = {
        resX:{type:'f32',callback:(shaderContext)=>{return this.canvas ? this.canvas.width : window.innerWidth;}}, 
        resY:{type:'f32',callback:(shaderContext)=>{return this.canvas ? this.canvas.height : window.innerHeight;}}, //canvas resolution
        mouseX:{type:'f32',callback:(shaderContext)=>{
            if(!this.MOUSEMOVELISTENER) {
                let elm = shaderContext.canvas ? shaderContext.canvas : window;
                this.MOUSEMOVELISTENER = elm.onmousemove = (evt) => {
                    shaderContext.mouseX = evt.offsetX;
                    shaderContext.mouseY = evt.offsetY;
                }
                this.mouseX = 0;
            }
            return this.mouseX;
        }}, mouseY:{type:'f32',callback:(shaderContext)=>{
            if(!shaderContext.MOUSEMOVELISTENER) {
                let elm = shaderContext.canvas ? shaderContext.canvas : window;
                shaderContext.MOUSEMOVELISTENER = elm.onmousemove = (evt) => { //should set in the same place as mouseX
                    shaderContext.mouseX = evt.offsetX;
                    shaderContext.mouseY = evt.offsetY;
                }
                shaderContext.mouseY = 0;
            }
            return shaderContext.mouseY;
        }}, //mouse position
        clicked:{ type:'i32', //onmousedown
            callback:(shaderContext) => {
                if(!shaderContext.MOUSEDOWNLISTENER) {
                    let elm = shaderContext.canvas ? shaderContext.canvas : window;
                    shaderContext.MOUSEDOWNLISTENER = elm.onmousedown = (evt) => { //should set in the same place as mouseX
                        shaderContext.clicked = true;
                    }
                    shaderContext.MOUSEUPLISTENER = elm.onmouseup = (evt) => {
                        shaderContext.clicked = false;
                    }
                    //should do mobile device
                    shaderContext.clicked = false;
                }
                return shaderContext.clicked;
            }
        },
        //keyinputs
        frame:{type:'f32',callback:function(shaderContext){
            if(!shaderContext.frame) shaderContext.frame = 0;
            let result = shaderContext.frame;
            shaderContext.frame++;
            return result;
        }}, //frame counter
        utcTime:{type:'f32',callback:(shaderContext)=>{return Date.now();}} //utc time                 
    } //etc.. more we can add from shaderToy

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
                    
                        
                    const typeInfo = wgslTypeSizes[inputTypes[inpIdx].type];

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
                const typeInfo = wgslTypeSizes[this.builtInUniforms[this.defaultUniforms[i]].type];
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
        }={}, 
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
            return wgslTypeSizes[type];
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
            const bufferGroup = { };

            this.inputBuffers = [];
            this.uniformBuffer = undefined;
            this.outputBuffers = [];

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

        let bindGroupAlts = [];
        let uniformValues = [];
        let hasTextureBuffers = false;
        for(let i = 0; i < this.params.length; i++ ) {
            const node = this.params[i];
            if(typeof inputs[inpBuf_i] !== 'undefined' && this.altBindings?.[node.name] && this.altBindings?.[node.name].group !== this.bindGroupNumber) {
                if(!bindGroupAlts[this.altBindings?.[node.name].group]) {
                    if(bindGroupAlts[this.altBindings?.[node.name].group].length < this.altBindings?.[node.name].group) bindGroupAlts[this.altBindings?.[node.name].group].length = this.altBindings?.[node.name].group+1; 
                    bindGroupAlts[this.altBindings?.[node.name].group] = [];
                }
                if(!bindGroupAlts[this.altBindings?.[node.name].group].length >= binding) bindGroupAlts[this.altBindings?.[node.name].group].length = binding+1;
                bindGroupAlts[this.altBindings?.[node.name].group][binding] = inputs[i];
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
                        textureData,
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
                                            totalUniformBufferSize += wgslTypeSizes[inputTypes[j].type].alignment;
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
                Object.entries(shaders).find((obj) => {
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
                    totalUniformBufferSize += wgslTypeSizes[this.builtInUniforms[u].type].size; //assume 4 bytes per float/int (32 bit)
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

            if(!shaders.bindGroups) shaders.bindGroups = [];
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
        indexFormat, //uint16 or uint32
        useRenderBundle,
        workgroupsX,workgroupsY,workgroupsZ
    }={}, shaders, 
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

    getFunctionHead = (methodString) => {
        let startindex = methodString.indexOf('=>')+1;
        if(startindex <= 0) {
            startindex = methodString.indexOf('){');
        }
        if(startindex <= 0) {
            startindex = methodString.indexOf(') {');
        }
        return methodString.slice(0, methodString.indexOf('{',startindex) + 1);
    }

    splitIgnoringBrackets = (str) => {
        const result = [];
        let depth = 0; // depth of nested structures
        let currentToken = '';

        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if (char === ',' && depth === 0) {
                result.push(currentToken);
                currentToken = '';
            } else {
                currentToken += char;
                if (char === '(' || char === '[' || char === '{') {
                    depth++;
                } else if (char === ')' || char === ']' || char === '}') {
                    depth--;
                }
            }
        }

        // This is the change: Ensure any remaining content in currentToken is added to result
        if (currentToken) {
            result.push(currentToken);
        }

        return result;
    }

    tokenize(funcStr, shaderType='compute') {
        // Capture function parameters
        let head = this.getFunctionHead(funcStr);
        let paramString = head.substring(head.indexOf('(') + 1, head.lastIndexOf(')'));
        let params = this.splitIgnoringBrackets(paramString).map(param => ({
            token: param,
            isInput: true
        }));
        
        // Capture variables, arrays, and their assignments
        const assignmentTokens = (funcStr.match(/(const|let|var)\s+(\w+)\s*=\s*([^;]+)/g) || []).map(token => ({
            token,
            isInput: false
        }));

        // Capture built-in uniforms
        const builtInUniformsKeys = Object.keys(this.builtInUniforms).join("|");
        const builtInUniformsPattern = new RegExp(`(?<![a-zA-Z0-9_])(${builtInUniformsKeys})(?![a-zA-Z0-9_])`, 'g');

        const builtInUniformsTokens = (funcStr.match(builtInUniformsPattern) || []).map(token => ({
            token,
            isInput: false // or true, based on your requirements
        }));

        params = params.concat(builtInUniformsTokens);
        // Combine both sets of tokens
        return params.concat(assignmentTokens);
    }

    excludedNames = {
        'color':true,
        'position':true,
        'uv':true,
        'normal':true,
        'pixel':true
    }

    parse = (fstr, tokens, shaderType='compute') => {
        const ast = [];

        // Extract all returned variables from the tokens
        const returnMatches = fstr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        let returnedVars = returnMatches ? returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', '')) : undefined;

        returnedVars = this.flattenStrings(returnedVars);


        const functionBody = fstr.substring(fstr.indexOf('{')); 
        //basic function splitting, we dont support object inputs right now, anyway. e.g. we could add {x,y,z} objects to define vectors

        tokens.forEach(({ token, isInput },i) => {
            let isReturned = returnedVars?.find((v) => {
                if(token.includes(v)) {
                    if(
                        (shaderType !== 'compute' &&
                        Object.keys(this.excludedNames).find((t) => token.includes(t)) ||
                        Object.keys(this.builtInUniforms).find((t) => token.includes(t)))
                    ) {
                        tokens[i].isInput = false;
                    }
                    else return true;
                }
            });
            let isModified = new RegExp(`\\b${token.split('=')[0]}\\b(\\[\\w+\\])?\\s*=`).test(functionBody);

            if (token.includes('=')) {
                const variableMatch = token.match(/(const|let|var)?\s*(\w+)\s*=\s*(.+)/);
                if (variableMatch && (variableMatch[3].startsWith('new') || variableMatch[3].startsWith('['))) {
                    let length;
                    if (variableMatch[3].startsWith('new Array(')) {
                        // Match array size from new Array(512) pattern
                        const arrayLengthMatch = variableMatch[3].match(/new Array\((\d+)\)/);
                        length = arrayLengthMatch ? parseInt(arrayLengthMatch[1]) : undefined;
                    } else if (variableMatch[3].startsWith('new')) {
                        // Match from typed array pattern like new Float32Array([1,2,3])
                        const typedArrayLengthMatch = variableMatch[3].match(/new \w+Array\(\[([^\]]+)\]\)/);
                        length = typedArrayLengthMatch ? typedArrayLengthMatch[1].split(',').length : undefined;
                    } else {
                        // Match from direct array declaration like [1,2,3]
                        const directArrayLengthMatch = variableMatch[3].match(/\[([^\]]+)\]/);
                        length = directArrayLengthMatch ? directArrayLengthMatch[1].split(',').length : undefined;
                    }

                    ast.push({
                        type: 'array',
                        name: variableMatch[2],
                        value: variableMatch[3],
                        isInput,
                        length: length, // Added this line to set the extracted length
                        isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
                        isModified
                    });
                } else if (token.startsWith('vec') || token.startsWith('mat')) {
                    const typeMatch = token.match(/(vec\d|mat\d+x\d+)\(([^)]+)\)/);
                    if (typeMatch) {
                        ast.push({
                            type: typeMatch[1],
                            name: token.split('=')[0],
                            value: typeMatch[2],
                            isInput,
                            isReturned: returnedVars ? returnedVars?.includes(token.split('=')[0]) : isInput ? true : false,
                            isModified
                        });
                    }
                } else {
                    ast.push({
                        type: 'variable',
                        name: variableMatch[2],
                        value: variableMatch[3],
                        isUniform:true,
                        isInput,
                        isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
                        isModified
                    });
                }
            } else {
                // This is a function parameter without a default value
                ast.push({
                    type: 'variable',
                    name: token,
                    value: 'unknown',
                    isUniform:true,
                    isInput,
                    isReturned,
                    isModified
                });
            }
        });

        return ast;
    }

    inferTypeFromValue(value, funcStr, ast, defaultValue='f32') {
        value=value.trim()
        if(value === 'true' || value === 'false') return 'bool';
        else if(value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) return value.substring(1,value.length-1); //should extract string types
        else if (value.startsWith('vec')) {
            const floatVecMatch = value.match(/vec(\d)f/);
            if (floatVecMatch) {
                return floatVecMatch[0]; // Returns vec(n)f as-is
            }
            const vecTypeMatch = value.match(/vec(\d)\(/); // Check if the value starts with vec(n) pattern
            if (vecTypeMatch) {
                const vecSize = vecTypeMatch[1];
                const type = value.includes('.') ? `<f32>` : `<i32>`;
                return `vec${vecSize}${type}`;
            }
        } else if (value.startsWith('mat')) {
            const type = '<f32>'//value.includes('.') ? '<f32>' : '<i32>'; //f16 and f32 only supported in mats
            return value.match(/mat(\d)x(\d)/)[0] + type;
        } else if (value.startsWith('[')) {
            // Infer the type from the first element if the array is initialized with values
            const firstElement = value.split(',')[0].substring(1);
            if(firstElement === ']') return 'array<f32>';
            if (firstElement.startsWith('[') && !firstElement.endsWith(']')) {
                // Only recurse if the first element is another array and not a complete array by itself
                return this.inferTypeFromValue(firstElement, funcStr, ast);
            } else {
                // Check if the first element starts with vec or mat
                if (firstElement.startsWith('vec') || firstElement.startsWith('mat')) {
                    return `array<${this.inferTypeFromValue(firstElement, funcStr, ast)}>`;
                } else if (firstElement.includes('.')) {
                    return 'array<f32>';
                } else if (!isNaN(firstElement)) {
                    return 'array<i32>';
                }
            }
        } else if (value.startsWith('new Array')) {
            // If the array is initialized using the `new Array()` syntax, look for assignments in the function body
            const arrayNameMatch = value.match(/let\s+(\w+)\s*=/);
            if (arrayNameMatch) {
                const arrayName = arrayNameMatch[1];
                const assignmentMatch = funcStr.match(new RegExp(`${arrayName}\\[\\d+\\]\\s*=\\s*(.+?);`));
                if (assignmentMatch) {
                    return this.inferTypeFromValue(assignmentMatch[1], funcStr, ast);
                }
            } else return 'f32'
        } else if (value.startsWith('new Float32Array')) {
            return 'array<f32>';
        } else if (value.startsWith('new Float64Array')) {
            return 'array<f64>'
        } else if (value.startsWith('new Int8Array')) {
            return 'array<i8>';
        } else if (value.startsWith('new Int16Array')) {
            return 'array<i16>';
        } else if (value.startsWith('new Int32Array')) {
            return 'array<i32>';
        } else if (value.startsWith('new BigInt64Array')) { 
            return 'array<i64>';
        } else if (value.startsWith('new BigUInt64Array')) { 
            return 'array<u64>';
        } else if (value.startsWith('new Uint8Array') || value.startsWith('new Uint8ClampedArray')) {
            return 'array<u8>';
        } else if (value.startsWith('new Uint16Array')) {
            return 'array<u16>';
        } else if (value.startsWith('new Uint32Array')) {
            return 'array<u32>';
        } else if (value.includes('.')) {
            return 'f32';  // Float type for values with decimals
        } else if (!isNaN(value)) {
            return 'i32';  // Int type for whole numbers
        } else {
             // Check if the value is a variable name and infer its type from AST
            const astNode = ast.find(node => node.name === value);
            if (astNode) {
                if (astNode.type === 'array') {
                    return 'f32';  // Assuming all arrays are of type f32 for simplicity
                } else if (astNode.type === 'variable') {
                    return this.inferTypeFromValue(astNode.value, funcStr, ast);
                }
            }
        }
        
        return defaultValue;  // For other types
    }

    flattenStrings(arr) {
        if(!arr) return [];
        const callback = (item) => {
            if (item.startsWith('[') && item.endsWith(']')) {
                return item.slice(1, -1).split(',').map(s => s.trim());
            }
            return item;
        }
        return arr.reduce((acc, value, index, array) => {
            return acc.concat(callback(value, index, array));
        }, []);
    }

    generateDataStructures(funcStr, ast, bindGroup=0) {
        let code = '//Bindings (data passed to/from CPU) \n';
        // Extract all returned variables from the function string
        // const returnMatches = funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        // let returnedVars = returnMatches ? returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', '')) : undefined;

        // returnedVars = this.flattenStrings(returnedVars);

        // Capture all nested functions
        const functionRegex = /function (\w+)\(([^()]*|\((?:[^()]*|\([^()]*\))*\))*\) \{([\s\S]*?)\}/g;
        let modifiedStr = funcStr;

        let match;
        while ((match = functionRegex.exec(funcStr)) !== null) {
            // Replace the content of the nested function with a placeholder
            modifiedStr = modifiedStr.replace(match[3], 'PLACEHOLDER');
        }

        // Now, search for return statements in the modified string
        const returnMatches = modifiedStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        let returnedVars = returnMatches ? returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', '')) : undefined;
        returnedVars = this.flattenStrings(returnedVars);

        let uniformsStruct = ''; // Start the UniformsStruct
        let defaultsStruct = '';
        let hasUniforms = false; // Flag to check if there are any uniforms
        let defaultUniforms;

        const params = [];

        let bindingIncr = 0;

        let names = {};
        ast.forEach((node, i) => {
            if(names[node.name]) return;
            names[node.name] = true;
            if(returnedVars.includes(node.name) && !this.excludedNames[node.name]) node.isInput = true; //catch extra returned variables not in the explicit input buffers (data structures generated by webgpu)
            function escapeRegExp(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');  // $& means the whole matched string
            }

            if (new RegExp(`texture.*\\(${escapeRegExp(node.name)},`).test(funcStr)) {
                node.isTexture = true;
            } else if (new RegExp(`textureSampl.*\\(.*,${escapeRegExp(node.name)},`).test(funcStr)) {
                node.isSampler = true;
            }

            if (node.isTexture) {
                params.push(node);
                code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: texture_2d<f32>;\n\n`;
                bindingIncr++;
            } else if (node.isSampler) {
                params.push(node);
                code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: sampler;\n\n`;
                bindingIncr++;
            } else if(node.isInput && !this.builtInUniforms[node.name]) {
                if (node.type === 'array') {
                    const elementType = this.inferTypeFromValue(node.value.split(',')[0], funcStr, ast);
                    
                    node.type = elementType; // Use the inferred type directly
                    params.push(node);
                    code += `struct ${capitalizeFirstLetter(node.name)}Struct {\n    values: ${elementType}\n};\n\n`;
                    code += `@group(${bindGroup}) @binding(${bindingIncr})\n`;
                    
                    if (!returnedVars || returnedVars?.includes(node.name)) {
                        code += `var<storage, read_write> ${node.name}: ${capitalizeFirstLetter(node.name)}Struct;\n\n`;
                    } else {
                        code += `var<storage, read> ${node.name}: ${capitalizeFirstLetter(node.name)}Struct;\n\n`;
                    }
                    bindingIncr++;
                }
                else if (node.isUniform) {
                    if(!hasUniforms) {
                        uniformsStruct = `struct UniformsStruct {\n`;
                        hasUniforms = bindingIncr; // Set the flag to the index
                        bindingIncr++;
                    }
                    const uniformType = this.inferTypeFromValue(node.value, funcStr, ast);
                    node.type = uniformType;
                    params.push(node);
                    uniformsStruct += `    ${node.name}: ${uniformType},\n`; // Add the uniform to the UniformsStruct
                }
            } else if(this.builtInUniforms[node.name]) {
                if(!defaultUniforms) {
                    defaultUniforms = [];
                    defaultsStruct = `struct DefaultUniforms {\n`;
                }
                const uniformType = this.builtInUniforms[node.name].type;
                defaultsStruct += `    ${node.name}: ${uniformType},\n`; // Add the uniform to the UniformsStruct
                defaultUniforms.push(node.name);
            }
        });

        if(defaultUniforms) {
            defaultsStruct += '};\n\n';
            code += defaultsStruct;
            code += `@group(${bindGroup}) @binding(${bindingIncr}) var<uniform> defaults: DefaultUniforms;\n\n`; //the last binding will always be default uniforms in this case
            bindingIncr++;
        }

        if (hasUniforms) { // If there are any uniforms, add the UniformsStruct and its binding to the code
            uniformsStruct += '};\n\n'; // Close the UniformsStruct
            code += uniformsStruct;
            code += `@group(${bindGroup}) @binding(${hasUniforms}) var<uniform> uniforms: UniformsStruct;\n\n`;
        }

        return {code, params, defaultUniforms};
    }

    extractAndTransposeInnerFunctions = (body, extract=true, ast, params, shaderType) => {
        
        const functionRegex = /function (\w+)\(([^()]*|\((?:[^()]*|\([^()]*\))*\))*\) \{([\s\S]*?)\}/g;

        let match;
        let extractedFunctions = '';
        
        while ((match = functionRegex.exec(body)) !== null) {

            const functionHead = match[0];
            const funcName = match[1];
            const funcBody = match[3];
            let paramString = functionHead.substring(functionHead.indexOf('(') + 1, functionHead.lastIndexOf(')'));

            let outputParam;

            const regex = /return\s+([\s\S]*?);/;
            const retmatch = body.match(regex);
            if(retmatch) {
                let inferredType = this.inferTypeFromValue(retmatch[1], body, ast, false);
                if(inferredType) {
                    outputParam = inferredType;
                }
            }

            let params = this.splitIgnoringBrackets(paramString).map((p) => { 
                let split = p.split('=');
                let vname = split[0];
                let inferredType = this.inferTypeFromValue(split[1], body, ast);
                if(!outputParam) outputParam = inferredType;
                return vname+': '+inferredType;
            });

            // Transpose the function body
            const transposedBody = this.transposeBody(funcBody, funcBody, params, shaderType, true, undefined, false).code; // Assuming AST is not used in your current implementation

            //todo: infer output types better, instead of just assuming from the first input type
            extractedFunctions += `fn ${funcName}(${params}) -> ${outputParam} {${transposedBody}}\n\n`;
        }

        // Remove the inner functions from the main body
        if(extract) body = body.replace(functionRegex, '');

        return { body, extractedFunctions };
    }

    generateMainFunctionWorkGroup(funcStr, ast, params, shaderType ='compute', nVertexBuffers=1, workGroupSize=256) {
        let code = '';
        
        if(this.functions) {
            this.functions.forEach((f) => {
                let result = this.extractAndTransposeInnerFunctions(f.toString(), false, ast, params, shaderType);
                if(result.extractedFunctions) code += result.extractedFunctions;
            })
        }

        // Extract inner functions and transpose them
        const { body: mainBody, extractedFunctions } = this.extractAndTransposeInnerFunctions(funcStr.match(/{([\s\S]+)}/)[1], true, ast, params, shaderType);
        
        // Prepend the transposed inner functions to the main function
        code += extractedFunctions;

        let vtxInps;
        let vboInputStrings = [];
        if(shaderType === 'vertex' || shaderType === 'fragment') {

            let vboStrings = Array.from({length: nVertexBuffers}, (_, i) => {
                if(shaderType === 'vertex') vboInputStrings.push(
                    
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

            vtxInps = `
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
${vboStrings.join('\n')}`;

            code += `
struct Vertex {
    ${vtxInps}
};
`;
        }

        // Generate function signature
        if(shaderType === 'compute') {

            code += `
//Main function call\n//threadId tells us what x,y,z thread we are on\n
@compute @workgroup_size(${workGroupSize})
fn compute_main(  
    @builtin(global_invocation_id) threadId: vec3<u32>, //shader grid position
    @builtin(local_invocation_id) localId: vec3<u32>,   //workgroup grid position
    @builtin(local_invocation_index) localIndex: u32,   //linear index within workgroup grid
    @builtin(num_workgroups) workgroups: vec3<u32>,     //dispatch size (x,y,z) group count
    @builtin(workgroup_id) workgroupId: vec3<u32>       //position of workgroup in compute shader grid`;     
            code += '\n) {\n';

        } else if (shaderType === 'vertex') {
            code += `
@vertex
fn vtx_main(
    @builtin(vertex_index) vertexIndex : u32,   //current vertex
    @builtin(instance_index) instanceIndex: u32, //current instance
    ${vboInputStrings.join('\n')}`
            code += '\n) -> Vertex {\n var pixel: Vertex;\n'; //pixel is predeclared, can we can reference color, position, etc in our js-side shaders

        } else if (shaderType === 'fragment') {
            code += `
@fragment
fn frag_main(
    pixel: Vertex,
    @builtin(front_facing) is_front: bool,   //true when current fragment is on front-facing primitive
    @builtin(sample_index) sampleIndex: u32, //sample index for the current fragment
    @builtin(sample_mask) sampleMask: u32   //contains a bitmask indicating which samples in this fragment are covered by the primitive being rendered
) -> @location(0) vec4<f32> {`;
        }
        let shaderHead = code;
        // Transpose the main body
        let transposed = this.transposeBody(mainBody, funcStr, params, shaderType, shaderType === 'fragment', shaderHead, true);
        code += transposed.code;
        if(transposed.consts?.length > 0) 
            code = transposed.consts.join('\n') + '\n\n' + code;

        if (shaderType === 'vertex') code += `\n  return pixel; \n`; //
        code += '\n}\n';
        return code;
    }

    transposeBody = (body, funcStr, params, shaderType, returns = false, shaderHead='', extractConsts=false) => {
        let code = '';

        // Capture commented lines and replace with a placeholder
        const commentPlaceholders = {};
        let placeholderIndex = 0;
        body = body.replace(/\/\/.*$/gm, (match) => {
            const placeholder = `__COMMENT_PLACEHOLDER_${placeholderIndex}__`;
            commentPlaceholders[placeholder] = match;
            placeholderIndex++;
            return placeholder;
        });

        // Replace common patterns
        
        code = body.replace(/for \((let|var) (\w+) = ([^;]+); ([^;]+); ([^\)]+)\)/gm, 'for (var $2 = $3; $4; $5)');

        const stringPlaceholders = {};
        let stringPlaceholderIndex = 0;
        code = code.replace(/('|"|`)([\s\S]*?)\1/gm, (match) => {
            const placeholder = `__CODE_PLACEHOLDER_${stringPlaceholderIndex}__`;

            stringPlaceholders[placeholder] = match.substring(1,match.length-1);
            stringPlaceholderIndex++;
            return placeholder;
        });


        //code = code.replace(/const/g, 'let');
        code = code.replace(/const (\w+) = (?!(vec\d+|mat\d+|\[.*|array))/gm, 'let $1 = ')

        const vecMatDeclarationRegex = /(let|var) (\w+) = (vec\d+|mat\d+)/gm;
        code = code.replace(vecMatDeclarationRegex, 'var $2 = $3');
        const vecMatDeclarationRegex2 = /const (\w+) = (vec\d+|mat\d+)/gm;
        code = code.replace(vecMatDeclarationRegex2, 'const $2 = $3');

        // ------ Array conversion ------ ------ ------ ------ ------ ------ ------

        // Extract array variable names
        const arrayVars = [];
        code.replace(/(let|var|const) (\w+) = (array|\[)/gm, (match, p1, varName) => {
            arrayVars.push(varName);
            return match; // Just to keep the replace function working
        });

        if (shaderType !== 'vertex' && shaderType !== 'fragment') {
            code = code.replace(/(\w+)\[([\w\s+\-*\/]+)\]/gm, (match, p1, p2) => {
                if (arrayVars.includes(p1)) return match;  // if the variable is an array declaration, return it as is
                return `${p1}.values[${p2}]`;
            });
        } else {
            // When shaderType is vertex or fragment, exclude specific variable names from the replacement
            code = code.replace(/(position|vertex|color|normal|uv)|(\w+)\[([\w\s+\-*\/]+)\]/gm, (match, p1, p2, p3) => {
                if (p1 || arrayVars.includes(p2)) return match;  // if match is one of the keywords or is an array variable, return it as is
                return `${p2}.values[${p3}]`;  // otherwise, apply the transformation
            });
        }
        
        code = code.replace(/(\w+)\.length/gm, 'arrayLength(&$1.values)');


        code = code.replace(/(\/\/[^\n]*);/gm, '$1'); //trim off semicolons after comments

        // Convert arrays with explicit values (like let a = [1,2,3];)
        code = code.replace(/(let|var|const) (\w+) = \[([\s\S]*?)\];/gm, (match, varType, varName, values) => {
            const valuesLines = values.trim().split('\n');
            const vals = [];
            const cleanedValues = valuesLines.map(line => {
                let cleaned = line.substring(0,line.indexOf('//') > 0 ? line.indexOf('//') : undefined); // remove inline comments
                cleaned = cleaned.substring(0,line.indexOf('__CO') > 0 ? line.indexOf('__COMM') : undefined); // remove COMMENT_PLACEHOLDER
                vals.push(line);
                return cleaned?.indexOf(',') < 0 ? cleaned + ',' : cleaned; // append comma for the next value
            }).join('\n');

            const valuesWithoutComments = cleanedValues.replace(/\/\*.*?\*\//gm, '').trim(); // remove multi-line comments
            const valuesArray = this.splitIgnoringBrackets(valuesWithoutComments);
            const size = valuesArray.length;

            const hasDecimal = valuesWithoutComments.includes('.');
            const isVecWithF = /^vec\d+f/.test(valuesWithoutComments);
            const inferredType = (valuesWithoutComments.startsWith('mat') || hasDecimal || isVecWithF) ? 'f32' : 'i32';

            // Extract the type from the first value (assumes all values in the array are of the same type)
            let arrayValueType = inferredType;
            const arrayValueTypeMatch = valuesWithoutComments.match(/^(vec\d+f?|mat\d+x\d+)/gm);
            if (arrayValueTypeMatch) {
                arrayValueType = arrayValueTypeMatch[0];
            }

            return `${varType} ${varName} : array<${arrayValueType}, ${size}> = array<${arrayValueType}, ${size}>(\n${vals.join('\n')}\n);`;
        });

        function transformArrays(input) {
            let lines = input.split('\n');
            let output = [];

            function countCharacter(str, char) {
                return str.split(char).length - 1;
            }

            function extractFillValue(line) {
                let startIndex = line.indexOf('.fill(') + 6;
                let parenthesesCount = 1;
                let endIndex = startIndex;

                while (parenthesesCount !== 0 && endIndex < line.length) {
                    endIndex++;
                    if (line[endIndex] === '(') {
                        parenthesesCount++;
                    } else if (line[endIndex] === ')') {
                        parenthesesCount--;
                    }
                }

                return line.substring(startIndex, endIndex);
            }

            for (let line of lines) {
                line = line.trim();
                let transformedLine = line;

                if (/^(let|const|var)\s/.test(line) && line.includes('.fill(')) {
                    let variableName = line.split('=')[0].trim().split(' ')[1];
                    let size = line.split('new Array(')[1].split(')')[0].trim();
                    let fillValue = extractFillValue(line);

                    let sizeCount = countCharacter(size, '(') - countCharacter(size, ')');
                    for (let i = 0; i < sizeCount; i++) size += ')';

                    if (fillValue.startsWith('vec')) {
                        let isVecWithF = /vec\d+f/.test(fillValue);
                        let vecType = isVecWithF || fillValue.match(/\.\d+/) ? 'f32' : 'i32'; // Check for decimals
                        transformedLine = `var ${variableName} : array<${fillValue.split('(')[0]}<${vecType}>, ${size}>;\n` +
                                        `for (var i: i32 = 0; i < ${size}; i = i + 1) {\n` +
                                        `\t${variableName}[i] = ${fillValue.replace(fillValue.split('(')[0], fillValue.split('(')[0] + `<${vecType}>`)};\n}`;
                    } else if (fillValue.startsWith('mat')) {
                        transformedLine = `var ${variableName} : array<${fillValue.split('(')[0]}<f32>, ${size}>;\n` +
                                        `for (var i: i32 = 0; i < ${size}; i = i + 1) {\n` +
                                        `\t${variableName}[i] = ${fillValue.replace(/vec(\d)/g, 'vec$1<f32>')};\n}`;
                    } else {
                        transformedLine = `var ${variableName} : array<f32, ${size}>;\n` +
                                        `for (var i: i32 = 0; i < ${size}; i = i + 1) {\n` +
                                        `\t${variableName}[i] = ${fillValue};\n}`;
                    }
                }

                output.push(transformedLine);
            }
            
            return output.join('\n');
        }


        code = transformArrays(code);

        code = code.replace(/(let|var|const) (\w+) = new (Float|Int|UInt)(\d+)Array\((\d+)\);/gm, (match, keyword, varName, typePrefix, bitSize, arraySize) => {
            let typeChar;
            switch(typePrefix) {
                case 'Float': 
                    typeChar = 'f';
                    break;
                case 'Int': 
                    typeChar = 'i';
                    break;
                case 'UInt': 
                    typeChar = 'u';
                    break;
                default: 
                    typeChar = 'f'; // defaulting to int
            }
            return `var ${varName} : array<${typeChar}${bitSize}, ${arraySize}>;`;
        });

        // Convert new Arrays with explicit sizes last
        code = code.replace(/(let|var|const) (\w+) = new Array\((\d+)\);/gm, 'var $2 : array<f32, $2>;');

        // ------ ------ ------ ------ ------ ------ ------ ------ ------ ------

        // Handle mathematical operations
        code = replaceJSFunctions(code, replacements);

        // Handle vector and matrix creation
        const vecMatCreationRegex = /(vec(\d+)|mat(\d+))\(([^)]+)\)/gm;
        code = code.replace(vecMatCreationRegex, (match, type, vecSize, matSize, args) => {
            // Split the arguments and check if any of them contain a decimal point
            const argArray = args.split(',').map(arg => arg.trim());
            const hasDecimal = argArray.some(arg => arg.includes('.'));
            
            const isVecWithF = /^vec\d+f/.test(type);
            // If any argument has a decimal, it's a float, otherwise it's an integer
            const inferredType = (type.startsWith('mat') || isVecWithF || hasDecimal) ? 'f32' : 'i32';
            
            if (type.startsWith('mat')) {
                // Always set internal vecs of mats to f32
                return `${type}<f32>(${argArray.join(', ').replace(/vec(\d+)/gm, 'vec$1<f32>')})`;
            } else {
                return `${type}<${inferredType}>(${argArray.join(', ')})`;
            }
        });

        
        params.forEach((param) => {
            if(param.isUniform) {
                const regex = new RegExp(`(?<![a-zA-Z0-9])${param.name}(?![a-zA-Z0-9])`, 'gm');
                code = code.replace(regex, `uniforms.${param.name}`);
            }
        });

        Object.keys(this.builtInUniforms).forEach((param) => {
            const regex = new RegExp(`(?<![a-zA-Z0-9])${param}(?![a-zA-Z0-9])`, 'gm');
            code = code.replace(regex, `defaults.${param}`);
        });

        // Replace placeholders with their corresponding comments
        for (const [placeholder, comment] of Object.entries(commentPlaceholders)) {
            code = code.replace(placeholder, comment);
        }
        for (const [placeholder, str] of Object.entries(stringPlaceholders)) {
            code = code.replace(placeholder, str);
        }
        
        //Vertex and Fragment shader transpiler (with some assumptions we made)
        // Extract variable names from the Vertex struct definition
        if(shaderType === 'fragment' || shaderType === 'vertex') {
            const vertexVarMatches = shaderHead.match(/@location\(\d+\) (\w+):/gm);
            const vertexVars = vertexVarMatches ? vertexVarMatches.map(match => {
                const parts = match.split(' ');
                return parts[1].replace(':', ''); // remove the colon
            }) : [];
            vertexVars.push('position');

            // Replace variables without pixel prefix with pixel prefixed version
            vertexVars.forEach(varName => {
                const regex = new RegExp(`(?<![a-zA-Z0-9_.])${varName}(?![a-zA-Z0-9_.])`, 'gm');
                code = code.replace(regex, `pixel.${varName}`);
            });
        }


        // ------ ------ ------ ------ ------ ------ ------ ------ ------ ------

        // Ensure lines not ending with a semicolon or open bracket have a semicolon appended. Not sure if this is stable
        code = code.replace(/^(.*[^;\s\{\[\(\,\>\}])(\s*\/\/.*)$/gm, '$1;$2');
        code = code.replace(/^(.*[^;\s\{\[\(\,\>\}])(?!\s*\/\/)(?=\s*$)/gm, '$1;');
        //trim off some cases for inserting semicolons wrong
        code = code.replace(/(\/\/[^\n]*);/gm, '$1'); //trim off semicolons after comments
        code = code.replace(/;([^\n]*)\s*(\n\s*)\)/gm, '$1$2)');

        let consts;
        if(extractConsts) {
            function extrConsts(text) {
                const pattern = /const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*[a-zA-Z_][a-zA-Z0-9_<>,\s]*\s*=\s*[a-zA-Z_][a-zA-Z0-9_<>,\s]*(\([\s\S]*?\)|\d+\.?\d*);/gm;

                let match;
                const extractedConsts = [];

                while ((match = pattern.exec(text)) !== null) {
                    extractedConsts.push(match[0]);
                }

                const pattern2 = /const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\([\s\S]*?\)\s*;/gm;

                while ((match = pattern2.exec(text)) !== null) {
                    extractedConsts.push(match[0]);
                }

                const modifiedText = text.replace(pattern, '').replace(pattern2,'').trim();

                return {
                    consts:extractedConsts,
                    code:modifiedText
                };
            }
            
            
            //we will move these to outside the function loop to speed things up
            let extracted = extrConsts(code);
            code = extracted.code;
            consts = extracted.consts;
        }

        if(!returns) code = code.replace(/(return [^;]+;)/gm, '//$1');
        this.mainBody = code;

        return {code, consts};
    }

    indentCode(code) {
        let depth = 0;
        const tab = '    ';  // 4 spaces for indentation, can be adjusted
        let result = '';
        let needsIndent = false;
        let leadingSpaceDetected = false;
    
        for (let i = 0; i < code.length; i++) {
            const char = code[i];
    
            // If a newline is detected, set the flag to true to apply indentation
            if (char === '\n') {
                result += char;
                needsIndent = true;
                leadingSpaceDetected = false;
                continue;
            }
    
            // Check if there's leading space
            if (char === ' ' && needsIndent) {
                leadingSpaceDetected = true;
            }
    
            // Apply the necessary indentation if no leading space is detected
            if (needsIndent && !leadingSpaceDetected) {
                result += tab.repeat(depth);
                needsIndent = false;
            }
    
            // Increase the depth when an opening brace or parenthesis is detected
            if (char === '{' || char === '(') {
                depth++;
            }
    
            // Decrease the depth when a closing brace or parenthesis is detected
            if (char === '}' || char === ')') {
                if (depth > 0) depth--;
                if (result.slice(-tab.length) === tab) {
                    result = result.slice(0, -tab.length);
                }
            }
    
            result += char;
        }
    
        return result;
    }

    addFunction = (func, shaders) => {
        if(!this.functions) this.functions = [];
        this.functions.push(func);
        for(const key of ['compute','fragment','vertex']) {
            if(shaders[key])
                Object.assign(shaders[key], this.convertToWebGPU(shaders[key].funcStr, key, shaders[key].bindGroupNumber, shaders[key].nVertexBuffers, shaders[key].workGroupSize ? shaders[key].workGroupSize : undefined)); 
        }
        return this.init(shaders, undefined, shaders.device);
    }

    //combine input bindings and create mappings so input arrays can be shared based on variable names, assuming same types in a continuous pipeline (the normal thing)
    combineBindings(bindings1str, bindings2str) {
        const bindingRegex = /@group\((\d+)\) @binding\((\d+)\)[\s\S]*?var[\s\S]*? (\w+):/g;
        const structRegex = /struct (\w+) \{([\s\S]*?)\}/;

        const combinedStructs = new Map();
        const replacementsOriginal = new Map();
        const replacementsReplacement = new Map();

        let changesOriginal = {};
        let changesReplacement = {};

        const extractBindings = (str, replacements, changes) => {
            let match;
            const regex = new RegExp(bindingRegex);
            while ((match = regex.exec(str)) !== null) {
                replacements.set(match[3], match[0].slice(0, match[0].indexOf(' var')));
                changes[match[3]] = {
                    group: match[1],
                    binding: match[2]
                };
            }
        };

        extractBindings(bindings1str, replacementsOriginal, changesOriginal);
        extractBindings(bindings2str, replacementsReplacement, changesReplacement);

        // Combine structs and ensure no duplicate fields
        let match = structRegex.exec(bindings1str);
        if (match) {
            const fields = match[2].trim().split(',\n').map(field => field.trim());
            combinedStructs.set(match[1], fields);
        }
        match = structRegex.exec(bindings2str);
        if (match) {
            const fields = match[2].trim().split(',\n').map(field => field.trim());
            const existing = combinedStructs.get(match[1]) || [];
            fields.forEach(field => {
                const fieldName = field.split(':')[0].trim();
                if (!existing.some(e => e.startsWith(fieldName))) {
                    existing.push(field);
                }
            });
            combinedStructs.set(match[1], existing);
        }

        const constructCombinedStruct = (structName) => {
            if (combinedStructs.has(structName)) {
                return `struct ${structName} {\n    ${combinedStructs.get(structName).join(',\n    ')}\n};\n`;
            }
            return '';
        };

        const result1 = bindings1str.replace(/struct UniformStruct \{[\s\S]*?\};/g, () => constructCombinedStruct('UniformStruct'))
        .replace(bindingRegex, match => {
            const varName = match.split(' ').pop().split(':')[0];
            if (replacementsReplacement.has(varName)) {
                const updated = replacementsOriginal.get(varName) + ' ' + match.split(' ').slice(-2).join(' ');
                const newGroup = updated.match(/@group\((\d+)\)/)[1];
                const newBinding = updated.match(/@binding\((\d+)\)/)[1];
                changesOriginal[varName] = { group: newGroup, binding: newBinding };
                return updated;
            }
            return match;
        });

        const result2 = bindings2str.replace(/struct UniformStruct \{[\s\S]*?\};/g, () => constructCombinedStruct('UniformStruct'))
        .replace(bindingRegex, match => {
            const varName = match.split(' ').pop().split(':')[0];
            if (replacementsOriginal.has(varName)) {
                const updated = replacementsOriginal.get(varName) + ' ' + match.split(' ').slice(-2).join(' ');
                const newGroup = updated.match(/@group\((\d+)\)/)[1];
                const newBinding = updated.match(/@binding\((\d+)\)/)[1];
                changesReplacement[varName] = { group: newGroup, binding: newBinding };
                return updated;
            }
            return match;
        });

        return {
            code1: result1.trim(),
            changes1: changesOriginal,
            code2: result2.trim(),
            changes2: changesReplacement
        };

        /*
                const originalBindings = `
                struct UniformStruct {
                    a: f32,
                    b: f32,
                    c: f32
                };
                @group(0) @binding(0) var texture1: texture_2d<f32>;
                @group(0) @binding(1) var texture2: sampler;
                `;

                const replacementBindings = `
                struct UniformStruct {
                    c: f32,
                    d: f32
                };
                @group(1) @binding(0) var arr1: array<f32>;
                @group(1) @binding(1) var texture1: texture_2d<f32>;
                @group(1) @binding(2) var textureB: sampler;
                `;

                const combined = combineBindings(originalBindings, replacementBindings);
                console.log(combined.result1);
                console.log(combined.changes1);
                console.log(combined.result2);
                console.log(combined.changes2);
         * 
         * 
         * 
         */
    }

    //this pipeline is set to only use javascript functions so it can generate asts and infer all of the necessary buffering orders and types
    convertToWebGPU(func, shaderType='compute', bindGroupNumber=0, nVertexBuffers=1, workGroupSize=256) {
        let funcStr = typeof func === 'string' ? func : func.toString();
        funcStr = funcStr.replace(/(?<!\w)this\./g, '');
        const tokens = this.tokenize(funcStr, shaderType);
        const ast = this.parse(funcStr, tokens, shaderType);
        //console.log(ast);
        let webGPUCode = this.generateDataStructures(funcStr, ast, bindGroupNumber); //simply share bindGroups 0 and 1 between compute and render
        const bindings = webGPUCode.code;
        webGPUCode.code += '\n' + this.generateMainFunctionWorkGroup(funcStr, ast, webGPUCode.params, shaderType, nVertexBuffers, workGroupSize); // Pass funcStr as the first argument
        return {code:this.indentCode(webGPUCode.code), bindings, ast, params:webGPUCode.params, funcStr, defaultUniforms:webGPUCode.defaultUniforms, workGroupSize};
    }

}

         
function isTypedArray(x) { //https://stackoverflow.com/a/40319428
    return (ArrayBuffer.isView(x) && Object.prototype.toString.call(x) !== "[object DataView]");
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function replaceJSFunctions(code, replacements) {
    for (let [jsFunc, shaderFunc] of Object.entries(replacements)) {
        const regex = new RegExp(jsFunc.replace('.', '\\.'), 'g'); // Escape dots for regex
        code = code.replace(regex, shaderFunc);
    }
    return code;
}

// Usage:
const replacements = {
    'Math.PI': `${Math.PI}`,
    'Math.E':  `${Math.E}`,
    'Math.abs': 'abs',
    'Math.acos': 'acos',
    'Math.asin': 'asin',
    'Math.atan': 'atan',
    'Math.atan2': 'atan2', // Note: Shader might handle atan2 differently, ensure compatibility
    'Math.ceil': 'ceil',
    'Math.cos': 'cos',
    'Math.exp': 'exp',
    'Math.floor': 'floor',
    'Math.log': 'log',
    'Math.max': 'max',
    'Math.min': 'min',
    'Math.pow': 'pow',
    'Math.round': 'round',
    'Math.sin': 'sin',
    'Math.sqrt': 'sqrt',
    'Math.tan': 'tan',
    // ... add more replacements as needed
};

const wgslTypeSizes32 = {
    'bool':{ alignment: 1, size: 1 },
    'u8':  { alignment: 1, size: 1 },
    'i8':  { alignment: 1, size: 1 },
    'i32': { alignment: 4, size: 4 },
    'u32': { alignment: 4, size: 4 },
    'f32': { alignment: 4, size: 4 },
    'i64': { alignment: 8, size: 8 },
    'u64': { alignment: 8, size: 8 },
    'f64': { alignment: 8, size: 8 },
    'atomic': { alignment: 4, size: 4 },
    'vec2<f32>': { alignment: 8, size: 8 },
    'vec2f': { alignment: 8, size: 8 },
    'vec2<i32>': { alignment: 8, size: 8 },
    'vec2<u32>': { alignment: 8, size: 8 },
    'vec3<f32>': { alignment: 16, size: 12 },
    'vec3f': { alignment: 16, size: 12 },
    'vec3<i32>': { alignment: 16, size: 12 },
    'vec3<u32>': { alignment: 16, size: 12 },
    'vec4<f32>': { alignment: 16, size: 16 },
    'vec4f': { alignment: 16, size: 16 },
    'vec4<i32>': { alignment: 16, size: 16 },
    'vec4<u32>': { alignment: 16, size: 16 },
    'mat2x2<f32>': { alignment: 8, size: 16 },
    'mat2x2<i32>': { alignment: 8, size: 16 },
    'mat2x2<u32>': { alignment: 8, size: 16 },
    'mat3x2<f32>': { alignment: 8, size: 24 },
    'mat3x2<i32>': { alignment: 8, size: 24 },
    'mat3x2<u32>': { alignment: 8, size: 24 },
    'mat4x2<f32>': { alignment: 8, size: 32 },
    'mat4x2<i32>': { alignment: 8, size: 32 },
    'mat4x2<u32>': { alignment: 8, size: 32 },
    'mat2x3<f32>': { alignment: 16, size: 32 },
    'mat2x3<i32>': { alignment: 16, size: 32 },
    'mat2x3<u32>': { alignment: 16, size: 32 },
    'mat3x3<f32>': { alignment: 16, size: 48 },
    'mat3x3<i32>': { alignment: 16, size: 48 },
    'mat3x3<u32>': { alignment: 16, size: 48 },
    'mat4x3<f32>': { alignment: 16, size: 64 },
    'mat4x3<i32>': { alignment: 16, size: 64 },
    'mat4x3<u32>': { alignment: 16, size: 64 },
    'mat2x4<f32>': { alignment: 16, size: 32 },
    'mat2x4<i32>': { alignment: 16, size: 32 },
    'mat2x4<u32>': { alignment: 16, size: 32 },
    'mat3x4<f32>': { alignment: 16, size: 48 },
    'mat3x4<i32>': { alignment: 16, size: 48 },
    'mat3x4<u32>': { alignment: 16, size: 48 },
    'mat4x4<f32>': { alignment: 16, size: 64 },
    'mat4x4<i32>': { alignment: 16, size: 64 },
    'mat4x4<u32>': { alignment: 16, size: 64 }
};

const wgslTypeSizes16 = {
    'i16': { alignment: 2, size: 2 }, //and we can do these
    'u16': { alignment: 2, size: 2 }, //we can do these in javascript
    'f16': { alignment: 2, size: 2 },
    'vec2<f16>': { alignment: 4, size: 4 },
    'vec2<i16>': { alignment: 4, size: 4 },
    'vec2<u16>': { alignment: 4, size: 4 },
    'vec3<f16>': { alignment: 8, size: 6 },
    'vec3<i16>': { alignment: 8, size: 6 },
    'vec3<u16>': { alignment: 8, size: 6 },
    'vec4<f16>': { alignment: 8, size: 8 },
    'vec4<i16>': { alignment: 8, size: 8 },
    'vec4<u16>': { alignment: 8, size: 8 },
    'mat2x2<f16>': { alignment: 4, size: 8 },
    'mat2x2<i16>': { alignment: 4, size: 8 },
    'mat2x2<u16>': { alignment: 4, size: 8 },
    'mat3x2<f16>': { alignment: 4, size: 12 },
    'mat3x2<i16>': { alignment: 4, size: 12 },
    'mat3x2<u16>': { alignment: 4, size: 12 },
    'mat4x2<f16>': { alignment: 4, size: 16 },
    'mat4x2<i16>': { alignment: 4, size: 16 },
    'mat4x2<u16>': { alignment: 4, size: 16 },
    'mat2x3<f16>': { alignment: 8, size: 16 },
    'mat2x3<i16>': { alignment: 8, size: 16 },
    'mat2x3<u16>': { alignment: 8, size: 16 },
    'mat3x3<f16>': { alignment: 8, size: 24 },
    'mat3x3<i16>': { alignment: 8, size: 24 },
    'mat3x3<u16>': { alignment: 8, size: 24 },
    'mat4x3<f16>': { alignment: 8, size: 32 },
    'mat4x3<i16>': { alignment: 8, size: 32 },
    'mat4x3<u16>': { alignment: 8, size: 32 },
    'mat2x4<f16>': { alignment: 8, size: 16 },
    'mat2x4<i16>': { alignment: 8, size: 16 },
    'mat2x4<u16>': { alignment: 8, size: 16 },
    'mat3x4<f16>': { alignment: 8, size: 24 },
    'mat3x4<i16>': { alignment: 8, size: 24 },
    'mat3x4<u16>': { alignment: 8, size: 24 },
    'mat4x4<f16>': { alignment: 8, size: 32 },
    'mat4x4<i16>': { alignment: 8, size: 32 },
    'mat4x4<u16>': { alignment: 8, size: 32 }
};

export const textureFormats = {
    r: {
        "8unorm": "r8unorm",
        "16float": "r16float",
        "32float": "r32float"
    },
    rg: {
        "8unorm": "rg8unorm",
        "16float": "rg16float",
        "32float": "rg32float"
    },
    rgba: {
        "8unorm": "rgba8unorm",
        "8unorm-srgb": "rgba8unorm-srgb",
        "10a2unorm": "rgb10a2unorm",
        "16float": "rgba16float",
        "32float": "rgba32float"
    },
    bgra: {
        "8unorm": "bgra8unorm",
        "8unorm-srgb": "bgra8unorm-srgb"
    }
};

//IDK if this is correct but it mostly depends
export const imageToTextureFormats = {
    ".png": [
        "r8unorm", 
        "rg8unorm", 
        "rgba8unorm", 
        "rgba8unorm-srgb", 
        "rgb10a2unorm", 
        "bgra8unorm", 
        "bgra8unorm-srgb"
    ],
    ".jpg": [
        "r8unorm", 
        "rg8unorm", 
        "rgba8unorm", 
        "rgba8unorm-srgb", 
        "rgb10a2unorm", 
        "bgra8unorm", 
        "bgra8unorm-srgb"
    ],
    ".hdr": [
        "r16float", 
        "rg16float", 
        "rgba16float"
    ],
    ".exr": [
        "r32float", 
        "rg32float", 
        "rgba32float"
    ]
};

export const wgslTypeSizes = Object.assign({}, wgslTypeSizes16, wgslTypeSizes32);


for (const [key, value] of Object.entries(wgslTypeSizes)) {
    wgslTypeSizes[key] = { ...value, type: key };
}
