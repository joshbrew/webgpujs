import { WGSLTranspiler, WGSLTypeSizes } from "./transpiler";
import {ShaderOptions, RenderOptions, ComputeOptions, RenderPassSettings, ComputePassSettings, TranspiledShader} from './types'


//Self contained shader execution boilerplate
export class ShaderHelper {

    prototypes:{
        compute?:TranspiledShader,
        fragment?:TranspiledShader,
        vertex?:TranspiledShader
    }={};

    compute?:ShaderContext;
    vertex?:ShaderContext;
    fragment?:ShaderContext;

    process = (...inputs:any[]) => { return this.compute?.run(this.compute.computePass, ...inputs)};
    render = (renderPass?:RenderPassSettings, ...inputs:any[]) => { return this.fragment?.run(renderPass ? renderPass : this.fragment.renderPass ? this.fragment.renderPass : {vertexCount:1}, ...inputs);};


    canvas:HTMLCanvasElement | OffscreenCanvas; 
    context:GPUCanvasContext | OffscreenRenderingContext; 
    device:GPUDevice;
    functions:(Function|string)[] = [];

    //copy these to new ShaderHelpers to share buffers between shaders
    bindGroupLayouts:GPUBindGroupLayout[]=[];
    bindGroups:GPUBindGroup[]=[];
    bufferGroups:any[]=[];

    constructor(
        shaders:{
            compute?:TranspiledShader,
            fragment?:TranspiledShader,
            vertex?:TranspiledShader
        },
        options:ShaderOptions & ComputeOptions & RenderOptions
    ) {
        if(shaders) this.init(shaders,options);
    }

    init = (
        shaders:{
            compute?:TranspiledShader,
            fragment?:TranspiledShader,
            vertex?:TranspiledShader
        },
        options:ShaderOptions & ComputeOptions & RenderOptions={}
    ) => {

        Object.assign(this, options);

        if(!this.device) throw new Error(`
    No GPUDevice! Please retrieve e.g. via: 
    
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    if(!adapter) throw new Error('No GPU Adapter found!');
    device = await adapter.requestDevice();
    shaderhelper.init(shaders,{device});
`)
    if(!options.device) options.device = this.device

        if((shaders.fragment && !shaders.vertex) || (shaders.vertex && !shaders.fragment))
            shaders = this.generateShaderBoilerplate(shaders,options);

        if(!options.skipCombinedBindings) {
            if(shaders.compute && shaders.vertex) {
                let combined = WGSLTranspiler.combineBindings(shaders.compute.code, shaders.vertex.code);
                shaders.compute.code = combined.code1;
                shaders.compute.altBindings = combined.changes1;
                shaders.vertex.code = combined.code2; 
                shaders.vertex.altBindings = combined.changes2;
            }
            if(shaders.compute && shaders.fragment) {
                let combined = WGSLTranspiler.combineBindings(shaders.compute.code, shaders.fragment.code);
                shaders.compute.code = combined.code1;
                shaders.compute.altBindings = combined.changes1;
                shaders.fragment.code = combined.code2; 
                shaders.fragment.altBindings = combined.changes2;
            }
            if(shaders.vertex && shaders.fragment) { 
                let combined = WGSLTranspiler.combineBindings(shaders.vertex.code, shaders.fragment.code);
                shaders.vertex.code = combined.code1;
                shaders.vertex.altBindings = combined.changes1;
                shaders.fragment.code = combined.code2;
                shaders.fragment.altBindings = combined.changes2;
            }
        }
        
        Object.assign(this.prototypes,shaders);

        if(shaders.compute) {
            this.compute = new ShaderContext(Object.assign({},shaders.compute, options));
            this.compute.helper = this;
            Object.assign(this.compute, options);
        }
        if(shaders.fragment && shaders.vertex) {
            
            WGSLTranspiler.combineShaderParams(shaders.fragment, shaders.vertex);
            this.fragment = new ShaderContext(Object.assign({},shaders.fragment, options));
            this.fragment.helper = this;
            this.vertex = new ShaderContext(Object.assign({},shaders.vertex, options)); //this will just be a dummy context, use fragment
        }
        
        //create bind group layouts
        if(this.compute) {

            this.compute.bindGroupLayouts = this.bindGroupLayouts;
            this.compute.bindGroups = this.bindGroups;
            this.compute.bufferGroups = this.bufferGroups;

            const entries = this.compute.createBindGroupEntries(options?.renderPass?.textures);
            this.compute.setBindGroupLayout(entries);
        }
        if(this.fragment) {

            this.fragment.bindGroups = this.bindGroups;
            this.fragment.bindGroupLayouts = this.bindGroupLayouts;
            this.fragment.bufferGroups = this.bufferGroups;

            const entries = this.fragment.createBindGroupEntries(options?.renderPass?.textures);
            this.fragment.setBindGroupLayout(entries);
        }

        //create shader modules
        if (this.compute) { // If it's a compute shader
            
            this.compute.shaderModule = this.device.createShaderModule({
                code: shaders.compute.code
            });

            if(this.bindGroupLayouts.length > 0) {
                this.compute.pipelineLayout = this.device.createPipelineLayout({
                    bindGroupLayouts:this.bindGroupLayouts //this should have the combined compute and vertex/fragment (and accumulated) layouts
                });
            }

            const pipeline:GPUComputePipelineDescriptor = {
                layout: this.compute.pipelineLayout ? this.compute.pipelineLayout : 'auto',
                compute: {
                    module: this.compute.shaderModule,
                    entryPoint: 'compute_main'
                }
            };

            if(options?.computePipelineSettings) Object.assign(pipeline,  options?.computePipelineSettings); 

            this.compute.computePipeline = this.device.createComputePipeline(pipeline);

        } 
        if (this.vertex && this.fragment) { // If both vertex and fragment shaders are provided
            
            this.vertex.shaderModule = this.device.createShaderModule({
                code: shaders.vertex.code
            });

            this.fragment.shaderModule = this.device.createShaderModule({
                code: shaders.fragment.code
            });

            if(this.bindGroupLayouts.length > 0) {
                this.fragment.pipelineLayout = this.device.createPipelineLayout({
                    bindGroupLayouts:this.bindGroupLayouts //this should have the combined compute and vertex/fragment (and accumulated) layouts
                });
            }

            this.updateGraphicsPipeline(options?.nVertexBuffers,  options?.contextSettings,  options?.renderPipelineSettings);

        } 

        //eof
    }

    addFunction = (func:Function|string) => {
        this.functions.push(func);
        for(const key of ['compute','fragment','vertex']) {
            if(this.prototypes[key])
                Object.assign(this.prototypes[key], 
                    WGSLTranspiler.convertToWebGPU(
                        this.prototypes[key].funcStr, 
                        key as any, 
                        this.prototypes[key].bindGroupNumber, 
                        this.prototypes[key].nVertexBuffers, 
                        this.prototypes[key].workGroupSize ? this.prototypes[key].workGroupSize : undefined,
                        this.functions)
                    ); 
        }
        this.init(this.prototypes, {skipCombinedBindings:true});
    }

    generateShaderBoilerplate = (shaders, options) => {
        
        for (const shaderType of ['compute','vertex','fragment']) {
            
            const shaderContext = shaders[shaderType];
            if(!shaderContext) continue;

            if(shaderContext && shaderType === 'fragment' && !shaders.vertex) {
                let vboInputStrings = [] as any[];

                let vboStrings = Array.from({length: options.nVertexBuffers}, (_, i) => {
                    vboInputStrings.push(
                
`@location(${4*i}) color${i>0 ? i+1 : ''}In: vec4<f32>,
    @location(${4*i+1}) vertex${i>0 ? i+1 : ''}In: vec3<f32>, 
    @location(${4*i+2}) normal${i>0 ? i+1 : ''}In: vec3<f32>,
    @location(${4*i+3}) uv${i>0 ? i+1 : ''}In: vec2<f32>${i===options.nVertexBuffers-1 ? '' : ','}`
                    );
                return `
    @location(${4*i}) color${i>0 ? i+1 : ''}: vec4<f32>,
    @location(${4*i+1}) vertex${i>0 ? i+1 : ''}: vec3<f32>, 
    @location(${4*i+2}) normal${i>0 ? i+1 : ''}: vec3<f32>,
    @location(${4*i+3}) uv${i>0 ? i+1 : ''}: vec2<f32>${i===options.nVertexBuffers-1 ? '' : ','}`;
            });

                this.vertex = {
                    code:`
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
                } as any; //todo: missing params
            } else if (shaderContext && shaderType === 'vertex' && !shaders.fragment) {
                this.fragment = {
                    code:`
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
                } as any; //todo: missing params
            }

            shaderContext.device = this.device;
        }

        return shaders;
    }
    
    cleanup = () => {
        if(this.device) this.device.destroy(); //destroys all info associated with pipelines on this device
        if(this.context) (this.context as GPUCanvasContext)?.unconfigure();
    }


    createRenderPipelineDescriptor = (
        nVertexBuffers=1, 
        swapChainFormat = navigator.gpu.getPreferredCanvasFormat()
    ) => {
        if(!this.fragment || !this.vertex) throw new Error("No Fragment and Vertex ShaderContext defined");

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

        const renderPipelineDescriptor = { //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
            layout: this.fragment.pipelineLayout ? this.fragment.pipelineLayout : 'auto',
            vertex: {
                module: this.vertex.shaderModule,
                entryPoint: 'vtx_main',
                buffers: vertexBuffers
            },
            fragment: {
                module: this.fragment.shaderModule,
                entryPoint: 'frag_main',
                targets: [{
                    format: swapChainFormat
                }]
            },
            depthStencil: {
                format: "depth24plus", 
                depthWriteEnabled: true, 
                depthCompare: "less"
            }
        } as GPURenderPipelineDescriptor;
        

        return renderPipelineDescriptor;
    }

    createRenderPassDescriptor = () => {
        
        const view = (this.context as GPUCanvasContext)?.getCurrentTexture().createView();
        const depthTexture = this.device.createTexture({
            //allows 3D rendering
            size: {width: this.canvas.width, height: this.canvas.height},
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        return { //some assumptions. todo: unassume
            colorAttachments: [{
                view: view,
                loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "discard" //"store"
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "discard", //"store"
                //stencilLoadOp: "clear",
                //stencilClearValue: 0,
                //stencilStoreOp: "store"
            }
        } as GPURenderPassDescriptor;
    }

    //todo: break this down more
    updateGraphicsPipeline = (
        nVertexBuffers=1, 
        contextSettings?:GPUCanvasConfiguration, 
        renderPipelineDescriptor?:GPURenderPipelineDescriptor,
        renderPassDescriptor?:GPURenderPassDescriptor
    ) => {
        if(!this.fragment || !this.vertex) throw new Error("No Fragment and Vertex ShaderContext defined");

        // Setup render outputs
        const swapChainFormat = navigator.gpu.getPreferredCanvasFormat();

        (this.context as GPUCanvasContext)?.configure(contextSettings ? contextSettings : {
            device: this.device, 
            format: swapChainFormat, 
            //usage: GPUTextureUsage.RENDER_ATTACHMENT,
            alphaMode: 'premultiplied'
        });

        if(!renderPipelineDescriptor) 
            renderPipelineDescriptor = this.createRenderPipelineDescriptor(nVertexBuffers, swapChainFormat);

        if(!renderPassDescriptor)
            renderPassDescriptor = this.createRenderPassDescriptor();

        this.fragment.renderPassDescriptor = renderPassDescriptor;


        this.fragment.graphicsPipeline = this.device.createRenderPipeline(renderPipelineDescriptor);
         
        // const canvasView = this.device.createTexture({
        //     size: [this.canvas.width, this.canvas.height],
        //     sampleCount:4,
        //     format: navigator.gpu.getPreferredCanvasFormat(),
        //     usage: GPUTextureUsage.RENDER_ATTACHMENT,
        // });

    }

    static flattenArray(arr) {
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

    static combineVertices(
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

}

export class ShaderContext {

    canvas:HTMLCanvasElement | OffscreenCanvas; 
    context:GPUCanvasContext | OffscreenRenderingContext; 
    device:GPUDevice; 
    helper:ShaderHelper;
    
    code: string;
    bindings: string;
    ast: any[];
    params: any[];
    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize?: number;
    returnedVars?:any[];

    functions;

    shaderModule?:GPUShaderModule;
    pipelineLayout?:GPUPipelineLayout;

    computePass?:ComputePassSettings;
    renderPass?:RenderPassSettings;
    
    computePipeline?:GPUComputePipeline;
    graphicsPipeline?:GPURenderPipeline;

    renderPassDescriptor:GPURenderPassDescriptor;

    indexBuffer:GPUBuffer;
    indexFormat:string;
    contextSettings:any;
    renderPipelineSettings:GPURenderPipelineDescriptor;

    altBindings:any;

    builtInUniforms:any;

    bufferGroups:any = {};
    bindGroups:GPUBindGroup[]=[];
    bindGroupLayouts:GPUBindGroupLayout[]=[];
    
    bindGroupNumber:number;
    bindGroupLayout:GPUBindGroupLayout;
    bindGroupLayoutEntries:any;
    bufferGroup?:any;

    constructor(props?) {
        Object.assign(this, props);

        const bIUCopy = {};
        for(const key in WGSLTranspiler.builtInUniforms) {
            bIUCopy[key] = Object.assign({},WGSLTranspiler.builtInUniforms[key]); 
        }

        this.builtInUniforms = bIUCopy;

    }

    // Extract all returned variables from the function string
    createBindGroupEntries = (
        textures?:any,
        bindGroupNumber=this.bindGroupNumber,
        visibility=GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT
    ) => {
        let bufferIncr = 0;
        let uniformBufferIdx;

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if(!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        let samplers = bufferGroup?.samplers ? bufferGroup.samplers : {};
        for(const key in textures) {
            this.updateTexture(textures[key], key, textures[key].samplerSettings, bindGroupNumber); //generate texture buffers and samplers
        }

        const entries = bufferGroup.params.map((node, i) => {
            let isReturned = (bufferGroup.returnedVars === undefined || bufferGroup.returnedVars?.includes(node.name));
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
                const buffer = {
                    binding: bufferIncr,
                    visibility,
                    resource: textures[node.name] ? textures[node.name].createView() : {}
                };
                bufferIncr++;
                return buffer;
            } else if(node.isSampler) {
                const buffer = {
                    binding: bufferIncr,
                    visibility,
                    resource: samplers[node.name] ? samplers[node.name] : {}
                };
                bufferIncr++;
                return buffer;
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

        if(bufferGroup.defaultUniforms) {
            entries.push({
                binding:bufferIncr,
                visibility,
                buffer: {
                    type: 'uniform'
                }
            })
        }

        this.bindGroupLayoutEntries = entries;
        return entries as GPUBindGroupLayoutEntry[];
    }

    setBindGroupLayout = (entries=[], bindGroupNumber=this.bindGroupNumber) => {
        if(entries.length > 0) {
            this.bindGroupLayout = this.device.createBindGroupLayout({
                entries
            });
            this.bindGroupLayouts[bindGroupNumber] = this.bindGroupLayout;
        }
        return this.bindGroupLayout;
    }

    updateVBO = (vertices, index=0, bufferOffset=0, dataOffset=0, bindGroupNumber=this.bindGroupNumber) => { //update
        
        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if(!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber)
        }

        if(vertices) {
            if(!isTypedArray(vertices)) {
                if(!Array.isArray(vertices)) {
                    vertices = ShaderHelper.combineVertices(
                        typeof vertices.color?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.color) : vertices.color,
                        typeof vertices.position?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.position) : vertices.position,
                        typeof vertices.normal?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.normal) : vertices.normal,
                        typeof vertices.uv?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.uv) : vertices.uv
                    );
                }
                else vertices = new Float32Array(typeof vertices === 'object' ? ShaderHelper.flattenArray(vertices) : vertices);
            }
            
            if(bufferGroup.vertexBuffers?.[index]?.size !== vertices.byteLength) {
                if(!bufferGroup.vertexBuffers) bufferGroup.vertexBuffers = [] as any[];
                
                const vertexBuffer = this.device.createBuffer({
                    size: vertices.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 
                    //assume read/write
                });

                bufferGroup.vertexBuffers[index] = vertexBuffer; 

            }

            if(!bufferGroup.vertexCount) bufferGroup.vertexCount = vertices.length / 12;

            // Copy the vertex data over to the GPUBuffer using the writeBuffer() utility function
            this.device.queue.writeBuffer(
                bufferGroup.vertexBuffers[index], 
                bufferOffset, 
                vertices, 
                dataOffset, 
                vertices.length
            );
        }
    }

    updateTexture = (texture, name:string, samplerSettings?, bindGroupNumber=this.bindGroupNumber) => {
        if(!texture) return;

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if(!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber)
        }

        bufferGroup.textures[name] = this.device.createTexture({
            label:  texture.label ? texture.label :`texture_g${bindGroupNumber}_${name}`,
            format: texture.format ? texture.format : 'rgba8unorm',
            size:  [texture.width, texture.height, 1],
            usage:  texture.usage ? texture.usage : (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUBufferUsage.COPY_SRC) //assume read/write (e.g. transforming a texture and returning it)
        });

        let texInfo = {} as any;
        if(texture.data) texInfo.texture = texture.data;
        else texInfo.source = texture;

        if(texInfo.texture)
            this.device.queue.writeTexture(
                texInfo,
                bufferGroup.textures[name],
                { 
                    bytesPerRow: texture.bytesPerRow ? texture.bytesPerRow : texture.width * 4 },
                { 
                    width: texture.width, 
                    height: texture.height 
                },
            );
        else if (texInfo.source)
            this.device.queue.copyExternalImageToTexture(
                texInfo, //e.g. an ImageBitmap
                bufferGroup.textures[name],
                [texture.width, texture.height]
            );

        const sampler = this.device.createSampler(samplerSettings ? samplerSettings : {
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: "linear",
            addressModeU: "repeat",
            addressModeV: "repeat"
        });

        bufferGroup.samplers[name] = sampler;

        //we need to pass the sampler and texture view to the bindGroupLayout
        return true; //textures/samplers updated
    }

    setUBOposition = (dataView, inputTypes, typeInfo, offset, input, inpIdx) => { //utility function, should clean up later (i.e. provide the values instead of objects to reference)
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
                const flatMatrix = typeof input[0] === 'object' ? ShaderHelper.flattenArray(input) : input;
                for (let j = 0; j < flatMatrix.length; j++) {
                    dataView.setFloat32(offset + j * 4, flatMatrix[j], true); //we don't have Float16 in javascript :-\
                }
            } else{
                switch (inputTypes[inpIdx].type) {
                    case 'f32':
                        dataView.setFloat32(offset, input, true); // true for little-endian
                        break;
                    case 'i32':
                        dataView.setInt32(offset, input, true);
                        break;
                    case 'u32':
                        dataView.setUInt32(offset, input, true); 
                        break;
                    case 'f16':
                        dataView.setFloat16(offset, input, true); 
                        break;
                    case 'i16':
                        dataView.setInt16(offset, input, true); 
                        break;
                    case 'u16':
                        dataView.setUInt16(offset, input, true); 
                        break;
                    case 'i8':
                        dataView.setInt8(offset, input, true);
                        break;
                    case 'u8':
                        dataView.setUInt8(offset, input, true); 
                        break;
                }
            }
        }
        offset += typeInfo.size; // Increment the offset by the size of the type
        return offset;
    }

    updateUBO = (inputs, inputTypes, bindGroupNumber=this.bindGroupNumber) => {
        if(!inputs) return;
        
        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if(!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber)
        }

        if(bufferGroup.uniformBuffer) { //update custom uniforms
            // Use a DataView to set values at specific byte offsets
            const dataView = new DataView(bufferGroup.uniformBuffer.getMappedRange()); //little endian
    
            let offset = 0; // Initialize the offset
            let inpIdx = 0;
            bufferGroup.params.forEach((node, i) => {
                if(node.isUniform) {
                    let input;
                    if(Array.isArray(inputs)) input = inputs[inpIdx];
                    else input = inputs?.[node.name];
                    if(typeof input === 'undefined' && typeof bufferGroup.uniformBufferInputs?.[inpIdx] !== 'undefined') 
                        input = bufferGroup.uniformBufferInputs[inpIdx]; //save data
                     
                    const typeInfo = WGSLTypeSizes[inputTypes[inpIdx].type];

                    if(!bufferGroup.uniformBufferInputs) {
                        bufferGroup.uniformBufferInputs = {};
                    } bufferGroup.uniformBufferInputs[inpIdx] = input;

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
            bufferGroup.uniformBuffer.unmap();
        }

        if(bufferGroup.defaultUniforms) { //update built-in uniforms (you can add whatever you want to the builtInUniforms list)
            // Use a DataView to set values at specific byte offsets
            const dataView = new DataView(bufferGroup.defaultUniformBuffer.getMappedRange()); //little endian
            let offset = 0; // Initialize the offset

            bufferGroup.defaultUniforms.forEach((u,i) => { 
                let value = this.builtInUniforms[u]?.callback(this);
                const typeInfo = WGSLTypeSizes[this.builtInUniforms[bufferGroup.defaultUniforms[i]].type];
                offset = this.setUBOposition(dataView,inputTypes,typeInfo,offset,value,i);
            });

            bufferGroup.defaultUniformBuffer.unmap();
        }
    }

    makeBufferGroup = (bindGroupNumber=this.bindGroupNumber) => {
        const bufferGroup = {} as any;

        bufferGroup.params = this.params; //can get params from other shaders we transpiled
        bufferGroup.returnedVars = this.returnedVars;
        bufferGroup.defaultUniforms = this.defaultUniforms;
        bufferGroup.inputBuffers = [] as any[];
        bufferGroup.outputBuffers = [] as any[];
        bufferGroup.textures = {};
        bufferGroup.samplers = {};
        bufferGroup.uniformBuffer = undefined;

        this.bufferGroups[bindGroupNumber] = bufferGroup; //we aren't doing anything with these yet

        return bufferGroup
    }

    buffer = (
        { 
            vbos,  //[{vertices:[]}]
            textures, //{tex0:{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }}, //all required
            skipOutputDef,
            bindGroupNumber,
            outputVBOs, //we can read out the VBO e.g. to receive pixel data
            outputTextures
        }={} as any, 
        ...inputs
    ) => {

        if(!bindGroupNumber) bindGroupNumber = this.bindGroupNumber;

        
        // Create or recreate input buffers      // Extract all returned variables from the function string
        // Separate input and output AST nodes
 
        let bufferGroup = this.bufferGroups[bindGroupNumber];        

        if(!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber)
        }

        if(vbos) { //todo: we should make a robust way to set multiple inputs on bindings
            vbos.forEach((vertices,i) => {
                this.updateVBO(vertices, i, undefined, undefined, bindGroupNumber);
            });
        }

        let newTextures = false;
        if(textures) {
            for(const key in textures) {
                newTextures = this.updateTexture(textures[key], key, textures[key].samplerSettings, bindGroupNumber);
            }
        }

        if(!bufferGroup.inputTypes && bufferGroup.params) 
            bufferGroup.inputTypes = bufferGroup.params.map((p) => {
                let type = p.type;
                if(type.startsWith('array')) {
                    type = type.substring(6,type.length-1) //cut off array<  >
                }
                return WGSLTypeSizes[type];
            });


        const inputBuffers = bufferGroup.inputBuffers;
        let uniformBuffer = bufferGroup.uniformBuffer;
        const outputBuffers = bufferGroup.outputBuffers;
        const textureBufs = bufferGroup.textures;
        const samplers = bufferGroup.samplers;
        const params = bufferGroup.params;

        const inputTypes = bufferGroup.inputTypes;
        let newBindGroupBuffer = false;
        if(inputBuffers?.length > 0) {
            inputs.forEach((inp,index) => {
                if(inp && inp?.length) {
                    if(inputBuffers.size !== inp.length * inputTypes[index].byteSize) {
                        newBindGroupBuffer = true;
                    }
                }
            });
        } else newBindGroupBuffer = true; //will trigger bindGroups to be set


        let uBufferPushed = false;
        let inpBuf_i = 0; let inpIdx = 0;
        let hasUniformBuffer = 0;
        let uBufferCreated = false;

        let bindGroupAlts = [] as any[];
        let uniformValues = [] as any[];

        if(params) for(let i = 0; i < params.length; i++ ) {
            const node = params[i];
            if(typeof inputs[inpBuf_i] !== 'undefined' && this.altBindings?.[node.name] && this.altBindings?.[node.name].group !== bindGroupNumber) {
                if(!bindGroupAlts[this.altBindings?.[node.name].group]) { 
                    bindGroupAlts[this.altBindings?.[node.name].group] = [] as any[];
                }
                bindGroupAlts[this.altBindings?.[node.name].group][this.altBindings?.[node.name].group] = inputs[i];
            } else {
                if(node.isUniform) {
                    if(inputs[inpIdx] !== undefined) 
                        uniformValues[inpIdx] = inputs[inpIdx];
                    // Assuming you've determined the total size of the uniform buffer beforehand
                    if (!bufferGroup.uniformBuffer || (!uBufferCreated && inputs[inpBuf_i] !== undefined)) {

                        if(!bufferGroup.totalUniformBufferSize) {
                            let totalUniformBufferSize = 0;
                            params.forEach((node,j) => {
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

                            bufferGroup.totalUniformBufferSize = totalUniformBufferSize;
                        }

                        uniformBuffer = this.device.createBuffer({
                            size: bufferGroup.totalUniformBufferSize ? bufferGroup.totalUniformBufferSize : 8, // This should be the sum of byte sizes of all uniforms
                            usage: GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_SRC,
                            mappedAtCreation:true
                        });
                        
                        inputBuffers[inpBuf_i] = (uniformBuffer);
                        bufferGroup.uniformBuffer = uniformBuffer;
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
                    if (typeof inputs[inpBuf_i] !== 'undefined' || !inputBuffers[inpBuf_i]) {
                        
                        if(!inputs?.[inpBuf_i]?.byteLength && Array.isArray(inputs[inpBuf_i]?.[0])) inputs[inpBuf_i] = ShaderHelper.flattenArray(inputs[inpBuf_i]);
                        
                        inputBuffers[inpBuf_i] = (
                            this.device.createBuffer({
                                size:  inputs[inpBuf_i] ? (inputs[inpBuf_i].byteLength ? inputs[inpBuf_i].byteLength : inputs[inpBuf_i]?.length ? inputs[inpBuf_i].length*4 : 8) : 8,
                                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                                mappedAtCreation: true
                            })  
                        );

                        new Float32Array(inputBuffers[inpBuf_i].getMappedRange()).set(inputs[inpBuf_i]);
                        inputBuffers[inpBuf_i].unmap();
                    }

                    inpBuf_i++;
                    inpIdx++;
                }

                //set output buffers
                if(!skipOutputDef && node.isReturned && (!node.isUniform || (node.isUniform && !uBufferPushed))) {
                    // Create or recreate the output buffers for all returned variables
                    if(!node.isUniform) {
                        outputBuffers[inpBuf_i-1] = (inputBuffers[inpBuf_i-1]);
                    } else if(!uBufferPushed) {
                        uBufferPushed = true;
                        outputBuffers[inpBuf_i-1] = (uniformBuffer);
                    }
                }
            }
        };

        if(bufferGroup.vertexBuffers && outputVBOs) { //we can get a copy of modified VBOs
            outputBuffers.push(...bufferGroup.vertexBuffers);
        }
        if(bufferGroup.textures && outputTextures) {
            for(const key in bufferGroup.textures) {
                outputBuffers.push()
            }
        }

        //run the buffer() call now for each group tied to each shader based on load order
        bindGroupAlts.forEach((inp,i) => {
            if(inp && i !== bindGroupNumber)
                this.buffer({bindGroupNumber:i}, ...inp);
        })
                                    
        if(bufferGroup.defaultUniforms) {  //make new buffer each input. todo: we could set this to be generalized
            
            if(!bufferGroup.totalDefaultUniformBufferSize) {
                let totalUniformBufferSize = 0;
                bufferGroup.defaultUniforms.forEach((u) => {
                    totalUniformBufferSize += WGSLTypeSizes[this.builtInUniforms[u].type].size; //assume 4 bytes per float/int (32 bit)
                });

                if(totalUniformBufferSize < 8) totalUniformBufferSize += 8 - totalUniformBufferSize; 
                else totalUniformBufferSize -= totalUniformBufferSize % 16; //correct final buffer size (I think)

                bufferGroup.totalDefaultUniformBufferSize = totalUniformBufferSize;
                    
            }                           

            bufferGroup.defaultUniformBuffer = this.device.createBuffer({
                size: bufferGroup.totalDefaultUniformBufferSize, // This should be the sum of byte sizes of all uniforms
                usage: GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_SRC,
                mappedAtCreation:true
            });

            if(!bufferGroup.defaultUniformBinding) {
                bufferGroup.defaultUniformBinding = inputBuffers.length; //latest binding in series
            }
            bufferGroup.defaultUniformBuffer;
            
        }
        
        this.updateUBO(uniformValues, inputTypes, bindGroupNumber);

        if(newTextures) {
            const entries = this.createBindGroupEntries(undefined,undefined,bindGroupNumber);
            this.setBindGroupLayout(entries, bindGroupNumber); //we need to reset the sampler and texture data on the bindGroup
            newBindGroupBuffer = true; // make sure a new bindGroup is made with updated buffers
        }
        if(this.bindGroupLayouts[bindGroupNumber] && newBindGroupBuffer) {
            // Update bind group creation to include both input and output buffers
            let bindGroupEntries = [];

            if(inputBuffers) bindGroupEntries.push(...inputBuffers.map((buffer, index) => ({
                binding: index,
                resource: { buffer }
            }))); 
            
            if(bufferGroup.defaultUniformBuffer) bindGroupEntries.push({
                binding: bufferGroup.defaultUniformBinding, 
                resource: {buffer:bufferGroup.defaultUniformBuffer}
            });

            const bindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayouts[bindGroupNumber],
                entries: bindGroupEntries
            });

            bufferGroup.bindGroup = bindGroup;
            this.bindGroups[bindGroupNumber] = bindGroup;
        }

        return newBindGroupBuffer;
        
    }

    getOutputData = (commandEncoder, outputBuffers?) => {
        //Return one or multiple results
        if(!outputBuffers) outputBuffers = this.bufferGroups[this.bindGroupNumber].outputBuffers;
        // Create staging buffers for all output buffers
        const stagingBuffers = outputBuffers.map(outputBuffer => {
            return this.device.createBuffer({
                size: outputBuffer.size,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
            });
        });

        // Copy data from each output buffer to its corresponding staging buffer
        outputBuffers.forEach((outputBuffer, index) => {
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
    run = ({
        vertexCount, //collapse into vertexData sets
        instanceCount, 
        firstVertex, 
        firstInstance, 
        vbos,  //[{vertices:[]}]
        outputVBOs,
        textures, //({data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) })[], //all required
        outputTextures,
        bufferOnly,
        skipOutputDef,
        bindGroupNumber,
        viewport,
        scissorRect,
        blendConstant,
        indexBuffer,
        firstIndex,
        indexFormat, //uint16 or uint32
        useRenderBundle,
        workgroupsX, workgroupsY, workgroupsZ
    }={} as RenderPassSettings & ComputePassSettings, 
    ...inputs
) => {
        if(!bindGroupNumber) bindGroupNumber = this.bindGroupNumber;
        const newInputBuffer = this.buffer(
            {
                vbos,  //[{vertices:[]}]
                textures, //[{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }], //all required
                skipOutputDef,
                bindGroupNumber,
                outputVBOs,
                outputTextures
            }, 
            ...inputs
        );

        if(!bufferOnly) { //todo: combine more shaders

            const bufferGroup = this.bufferGroups[bindGroupNumber];
            if(!bufferGroup) this.makeBufferGroup(bindGroupNumber);

            const commandEncoder = this.device.createCommandEncoder();
            if (this.computePipeline) { // If compute pipeline is defined
                const computePass = commandEncoder.beginComputePass();
                computePass.setPipeline(this.computePipeline);

                const withBindGroup = (group,i) => {
                    computePass.setBindGroup(i,group);
                }
                
                this.bindGroups.forEach(withBindGroup);

                let wX = workgroupsX ? workgroupsX : 
                bufferGroup.inputBuffers?.[0] ? (bufferGroup.inputBuffers[0].size/4) / this.workGroupSize : 1;
                computePass.dispatchWorkgroups(wX, workgroupsY, workgroupsZ); 
                computePass.end();

            } 
            if (this.graphicsPipeline) { // If graphics pipeline is defined

                let renderPass:GPURenderPassEncoder|GPURenderBundleEncoder;
                //faster repeat calls with useRenderBundle if input array buffers don't change size and are instead simply written to when needed. Our system handles the sizing and writing for us
                if(useRenderBundle && (newInputBuffer || !bufferGroup.renderBundle)) { 
                    //record a render pass
                    renderPass = this.device.createRenderBundleEncoder({
                        colorFormats: [navigator.gpu.getPreferredCanvasFormat()],
                        //depthStencilFormat: "depth24plus" //etc...
                    });
                    bufferGroup.firstPass = true;
                } else {
                    this.renderPassDescriptor.colorAttachments[0].view = (this.context as GPUCanvasContext)
                        .getCurrentTexture()
                        .createView();

                    renderPass = commandEncoder.beginRenderPass(this.renderPassDescriptor);
                }

                if(!useRenderBundle || !bufferGroup.renderBundle) { //drawIndirect?
                    renderPass.setPipeline(this.graphicsPipeline);
                    
                    const withBindGroup = (group,i) => {
                        renderPass.setBindGroup(i,group);
                    }

                    this.bindGroups.forEach(withBindGroup);
                    
                    if(!bufferGroup.vertexBuffers) {
                        this.updateVBO({color:[0,0,0,0]}, 0, 0, 0, bindGroupNumber); //put a default in to force it to run a single pass
                    }

                    if(bufferGroup.vertexBuffers) {
                        bufferGroup.vertexBuffers.forEach((vbo,i) => {
                            renderPass.setVertexBuffer(i, vbo); 
                        });
                        
                    }
                    
                    if(!useRenderBundle) {

                        if(viewport) {
                            (renderPass as GPURenderPassEncoder).setViewport(
                                viewport.x, viewport.y, viewport.width, viewport.height, viewport.minDepth, viewport.maxDepth
                            )
                        }
    
                        if(scissorRect) {
                            (renderPass as GPURenderPassEncoder).setScissorRect(
                                scissorRect.x, scissorRect.y, scissorRect.width, scissorRect.height
                            )
                        }
    
                        if(blendConstant) {
                            (renderPass as GPURenderPassEncoder).setBlendConstant(
                                blendConstant
                            )
                        }
                    }


                    if(vertexCount) bufferGroup.vertexCount = vertexCount;
                    else if(!bufferGroup.vertexCount) bufferGroup.vertexCount = 1;

                    if(indexBuffer || bufferGroup.indexBuffer) {
                        if(indexBuffer) bufferGroup.indexBuffer = indexBuffer;
                        if(!bufferGroup.indexFormat) bufferGroup.indexFormat = indexFormat ? indexFormat : "uint32";
                        renderPass.setIndexBuffer(bufferGroup.indexBuffer, bufferGroup.indexFormat);
                        renderPass.drawIndexed(
                            bufferGroup.vertexCount, 
                            instanceCount, 
                            firstIndex, 
                            0, 
                            firstInstance
                        );
                    } else {
                        renderPass.draw(
                            bufferGroup.vertexCount, 
                            instanceCount, 
                            firstVertex, 
                            firstInstance
                        );
                    }

                    if(useRenderBundle && bufferGroup.firstPass) {
                        bufferGroup.renderBundle = (renderPass as GPURenderBundleEncoder).finish(); //replace the encoder with the recording
                        bufferGroup.firstPass = false;
                    }
                } else {
                    (renderPass as GPURenderPassEncoder).executeBundles([bufferGroup.renderBundle]);
                }
                (renderPass as GPURenderPassEncoder).end();
            }

            if(!skipOutputDef && bufferGroup.outputBuffers?.length > 0) {
                return this.getOutputData(commandEncoder, bufferGroup.outputBuffers);
            } else return new Promise((r) => r(true));
            
        }
        
    }

}

      
function isTypedArray(x) { //https://stackoverflow.com/a/40319428
    return (ArrayBuffer.isView(x) && Object.prototype.toString.call(x) !== "[object DataView]");
}
