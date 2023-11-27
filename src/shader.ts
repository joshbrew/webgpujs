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

    process = (...inputs:any[]) => { 
        const shader = this.compute;
        if(shader)
            return this.compute?.run(this.compute.computePass, ...inputs)
    };
    render = (renderPass?:RenderPassSettings, ...inputs:any[]) => { 
        let shader = this.fragment ? this.fragment : this.vertex;
        if(shader) 
            return shader.run(renderPass ? renderPass : shader.renderPass ? shader.renderPass : {vertexCount:1}, ...inputs);
    };

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

        if((shaders.fragment && !shaders.vertex)) //todo: this might actually be a bad idea
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
            if(shaders.vertex?.params && shaders.fragment){
                if(shaders.fragment.params) shaders.vertex.params.push(...shaders.fragment.params); //make sure the vertex and fragment bindings are combined
                shaders.fragment.params = shaders.vertex.params;
            }
        }
        
        Object.assign(this.prototypes,shaders);

        if(shaders.compute) {
            this.compute = new ShaderContext(Object.assign({},shaders.compute, options));
            this.compute.helper = this;
            Object.assign(this.compute, options);
        }
        if(shaders.fragment && shaders.vertex) {
            WGSLTranspiler.combineShaderParams(shaders.vertex, shaders.fragment);
        }
        if(shaders.fragment) {
            this.fragment = new ShaderContext(Object.assign({},shaders.fragment, options));
            this.fragment.helper = this;
        }
        if(shaders.vertex) {
            this.vertex = new ShaderContext(Object.assign({},shaders.vertex, options)); //this will just be a dummy context, use fragment
            this.vertex.helper = this;
        }
        
        //create bind group layouts
        if(this.compute) {

            this.compute.bindGroupLayouts = this.bindGroupLayouts;
            this.compute.bindGroups = this.bindGroups;
            this.compute.bufferGroups = this.bufferGroups;
            const entries = this.compute.createBindGroupEntries(options?.renderPass?.textures);
            this.compute.bindGroupLayoutEntries = entries;
            this.compute.setBindGroupLayout(entries, options.bindGroupNumber);
        }
        if(this.fragment) {
            //console.log(shaders.fragment.code)
            this.fragment.bufferGroups = this.bufferGroups;
            this.fragment.bindGroupLayouts = this.bindGroupLayouts;
            const entries = this.fragment.createBindGroupEntries(options?.renderPass?.textures, undefined, GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT);
            this.fragment.bindGroupLayoutEntries = entries;
            this.fragment.bindGroupLayout = this.device.createBindGroupLayout({
                entries: entries
            });
            this.fragment.setBindGroupLayout(entries, options.bindGroupNumber);
        }

        //create shader modules
        if (this.compute) { // If it's a compute shader
            
            this.compute.shaderModule = this.device.createShaderModule({
                code: shaders.compute.code
            });

            if(this.bindGroupLayouts.length > 0) {
                this.compute.pipelineLayout = this.device.createPipelineLayout({
                    bindGroupLayouts:this.bindGroupLayouts.filter(v => {if(v) return true;}) //this should have the combined compute and vertex/fragment (and accumulated) layouts
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
        if(this.vertex) {
            this.vertex.shaderModule = this.device.createShaderModule({
                code: shaders.vertex.code
            });
        }
        if(this.fragment) {
            this.fragment.shaderModule = this.device.createShaderModule({
                code: shaders.fragment.code
            });
        }
        //todo: make vertex independent (but not fragment)
        if (this.vertex && this.fragment) { // If both vertex and fragment shaders are provided

            this.fragment.vertex = this.vertex;

            if(this.bindGroupLayouts.length > 0) {
                this.fragment.pipelineLayout = this.device.createPipelineLayout({
                    bindGroupLayouts:this.bindGroupLayouts.filter(v => {if(v) return true;}) //this should have the combined compute and vertex/fragment (and accumulated) layouts
                });
            }

            this.fragment.updateGraphicsPipeline(
                options?.nVertexBuffers,  
                options?.contextSettings,  
                options?.renderPipelineDescriptor,
                options?.renderPassDescriptor
            );
        } else if (this.vertex) {
            
            if(this.bindGroupLayouts.length > 0) {
                this.vertex.pipelineLayout = this.device.createPipelineLayout({
                    bindGroupLayouts:this.bindGroupLayouts.filter(v => {if(v) return true;}) //this should have the combined compute and vertex/fragment (and accumulated) layouts
                });
            }

            this.vertex.updateGraphicsPipeline(
                options?.nVertexBuffers,  
                options?.contextSettings,  
                options?.renderPipelineDescriptor,
                options?.renderPassDescriptor
            );
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
                
`@location(${4*i}) vertex${i>0 ? i+1 : ''}In: vec4<f32>,
    @location(${4*i+1}) color${i>0 ? i+1 : ''}In: vec4<f32>, 
    @location(${4*i+3}) uv${i>0 ? i+1 : ''}In: vec2<f32>,
    @location(${4*i+2}) normal${i>0 ? i+1 : ''}In: vec3<f32>${i===options.nVertexBuffers-1 ? '' : ','}`
                    );
                return `
    
    @location(${4*i}) vertex${i>0 ? i+1 : ''}: vec4<f32>, 
    @location(${4*i+1}) color${i>0 ? i+1 : ''}: vec4<f32>,
    @location(${4*i+2}) uv${i>0 ? i+1 : ''}: vec2<f32>,
    @location(${4*i+3}) normal${i>0 ? i+1 : ''}: vec3<f32>${i===options.nVertexBuffers-1 ? '' : ','}`;
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
            } 
//we don't actually need a fragment shader on a vertex shader (see shadowing example from webgpu samples)
//             else if (shaderContext && shaderType === 'vertex' && !shaders.fragment) {
//                 this.fragment = {
//                     code:`
// @fragment
// fn frag_main(
//     pixel: Vertex,
//     @builtin(front_facing) is_front: bool,   //true when current fragment is on front-facing primitive
//     @builtin(sample_index) sampleIndex: u32, //sample index for the current fragment
//     @builtin(sample_mask) sampleMask: u32,   //contains a bitmask indicating which samples in this fragment are covered by the primitive being rendered
//     @builtin(frag_depth) depth: f32          //Updated depth of the fragment, in the viewport depth range.
// ) -> @location(0) vec4<f32> {
//     return pixel.color;
// }`
//                 } as any; //todo: missing params
//             }

            shaderContext.device = this.device;
        }

        return shaders;
    }
    
    cleanup = () => {
        if(this.device) this.device.destroy(); //destroys all info associated with pipelines on this device
        if(this.context) (this.context as GPUCanvasContext)?.unconfigure();
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

    //we're just assuming that for the default frag/vertex we may want colors, positions, normals, or uvs. If you define your entire own shader pipeline then this can be ignored
    static combineVertices(
        vertices, //4d vec array
        colors,    //4d vec array
        uvs,        //2d vec array
        normals   //3d vec array
    ) {
        let length = 0;
        if(colors) length = colors.length / 4; 
        if (vertices?.length/4 > length) length = vertices.length / 4;
        if (normals?.length/3 > length) length = normals.length / 3;
        if (uvs?.length/2 > length) length = uvs.length / 2;
        const vertexCount = length;
        const interleavedVertices = new Float32Array(vertexCount * 13); // 13 values per vertex (we are just assuming you might want all 4 per object)

        for (let i = 0; i < vertexCount; i++) {
            const posOffset = i * 4;
            const colOffset = i * 4;
            const norOffset = i * 3;
            const uvOffset = i * 2;
            const interleavedOffset = i * 13;

            interleavedVertices[interleavedOffset] =  vertices ? vertices[posOffset] || 0 : 0;
            interleavedVertices[interleavedOffset + 1] =  vertices ? vertices[posOffset + 1] || 0 : 0;
            interleavedVertices[interleavedOffset + 2] =  vertices ? vertices[posOffset + 2] || 0 : 0;
            interleavedVertices[interleavedOffset + 3] =  vertices ? vertices[posOffset + 3] || 0 : 0;

            interleavedVertices[interleavedOffset + 4] =      colors ? colors[colOffset] || 0 : 0;
            interleavedVertices[interleavedOffset + 5] =  colors ? colors[colOffset + 1] || 0 : 0;
            interleavedVertices[interleavedOffset + 6] =  colors ? colors[colOffset + 2] || 0 : 0;
            interleavedVertices[interleavedOffset + 7] =  colors ? colors[colOffset + 3] || 0 : 0;

            interleavedVertices[interleavedOffset + 8] = uvs ? uvs[uvOffset] || 0 : 0;
            interleavedVertices[interleavedOffset + 9] = uvs ? uvs[uvOffset + 1] || 0 : 0;

            interleavedVertices[interleavedOffset + 10] =  normals ? normals[norOffset] || 0 : 0;
            interleavedVertices[interleavedOffset + 11] =  normals ? normals[norOffset + 1] || 0 : 0;
            interleavedVertices[interleavedOffset + 12] = normals ? normals[norOffset + 2] || 0 : 0;
        }

        return interleavedVertices;
    }

    static splitVertices(interleavedVertices) {
        const vertexCount = interleavedVertices.length / 13;  // 13 values per vertex (we are just assuming you might want all 4 per object)

        // Pre-allocating space
        const colors = new Float32Array(vertexCount * 4);
        const vertices = new Float32Array(vertexCount * 4);
        const normal = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);

        for (let i = 0; i < vertexCount; i++) {
            const posOffset = i * 4;
            const colOffset = i * 4;
            const norOffset = i * 3;
            const uvOffset = i * 2;
            const offset = i * 13;

            vertices[posOffset] = interleavedVertices[offset];
            vertices[posOffset + 1] = interleavedVertices[offset + 1];
            vertices[posOffset + 2] = interleavedVertices[offset + 2];
            vertices[posOffset + 3] = interleavedVertices[offset + 3];

            colors[colOffset] = interleavedVertices[offset + 4];
            colors[colOffset + 1] = interleavedVertices[offset + 5];
            colors[colOffset + 2] = interleavedVertices[offset + 7];
            colors[colOffset + 3] = interleavedVertices[offset + 8];

            uvs[uvOffset] = interleavedVertices[offset + 8];
            uvs[uvOffset + 1] = interleavedVertices[offset + 9];

            normal[norOffset] = interleavedVertices[offset + 10];
            normal[norOffset + 1] = interleavedVertices[offset + 11];
            normal[norOffset + 2] = interleavedVertices[offset + 12];
        }

        return {
            vertices,
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
    vertex?:ShaderContext; //The vertex shader context if this is a fragment shader
    
    code: string;
    header: string;
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

    altBindings:any;

    builtInUniforms:any;

    bufferGroups:any[] = [];

    bindings?:Partial<GPUBindGroupEntry>[];
    bindGroups:GPUBindGroup[]=[];
    bindGroupLayouts:GPUBindGroupLayout[]=[];
    
    bindGroupNumber:number;
    bindGroupLayout:GPUBindGroupLayout;
    bindGroupLayoutEntries:GPUBindGroupLayoutEntry[];

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

        if(textures) for(const key in textures) {
            this.updateTexture(textures[key], key, bindGroupNumber); //generate texture buffers and samplers
        }

        let texKeys; let texKeyRot = 0;
        if(bufferGroup.textures) texKeys = Object.keys(bufferGroup.textures);
        let assignedEntries = {};
        const entries = bufferGroup.params ? bufferGroup.params.map((node, i) => {
            if(node.group !== bindGroupNumber) return undefined;
            assignedEntries[node.name] = true;
            let isReturned = (bufferGroup.returnedVars === undefined || bufferGroup.returnedVars?.includes(node.name));
            if (node.isUniform) {
                if (typeof uniformBufferIdx === 'undefined') {
                    uniformBufferIdx = i;
                    bufferIncr++;
                    const buffer = {
                        binding: uniformBufferIdx,
                        visibility,
                        buffer: {
                            type: 'uniform'
                        }
                    };
                    if(this.bindings?.[node.name]) Object.assign(buffer,this.bindings[node.name]); //overrides
                    return buffer;
                } else return undefined;
            } else if(node.isTexture || node.isStorageTexture) { //rudimentary storage texture checks since typically they'll share bindings
                const buffer = {
                    binding: node.binding,
                    visibility
                } as any;
                if(node.isDepthTexture) buffer.texture = { sampleType:'depth' };
                else if(bufferGroup.textures?.[node.name]) {
                    buffer.texture = { 
                        sampleType:'float',
                        viewDimension:node.name.includes('3d') ? '3d' : node.name.includes('1d') ? '1d' : node.name.includes('2darr') ? '2d-array' : '2d'
                     };
                    buffer.resource = bufferGroup.textures?.[node.name] ? bufferGroup.textures[node.name].createView() : {} //todo: texture dimensions/format/etc customizable
                } else if (node.isStorageTexture && !node.isSharedStorageTexture) {
                    buffer.storageTexture = { //placeholder stuff but anyway you can provide your own bindings as the inferencing is a stretch after a point
                        access:'write-only', //read-write only in chrome beta, todo: replace this when avaiable in production
                        format:textures[node.name]?.format ? textures[node.name].format : 'rgbaunorm',
                        viewDimension:node.name.includes('3d') ? '3d' : node.name.includes('1d') ? '1d' : node.name.includes('2darr') ? '2d-array' : '2d'
                    };
                } else { //IDK
                    buffer.texture = { sampleType:'unfilterable-float' }
                }
                if(this.bindings?.[node.name]) Object.assign(buffer,this.bindings[node.name]); //overrides
                bufferIncr++;
                return buffer;
            } else if(node.isSampler) { //todo, we may want multiple samplers, need to separate texture and sampler creation
                if(!bufferGroup.samplers?.[node.name]) {
                    const sampler = this.device.createSampler((texKeys && textures[texKeys[texKeyRot]].samplerSettings?.[node.name]) ? textures[texKeys[texKeyRot]].samplerSettings[node.name] : {
                        magFilter: 'linear',
                        minFilter: 'linear',
                        mipmapFilter: "linear",
                        addressModeU: "repeat",
                        addressModeV: "repeat"
                    });
            
                    bufferGroup.samplers[node.name] = sampler;
                    
                }
              
                const buffer = {
                    binding: node.binding,
                    visibility,
                    sampler:{},
                    resource:bufferGroup.samplers[node.name] || {}
                } as any;
                
                texKeyRot++; if(texKeyRot >= texKeys?.length) texKeyRot = 0;
                bufferIncr++;
                
                if(this.bindings?.[node.name]) Object.assign(buffer,this.bindings[node.name]); //overrides
                return buffer;
            } else {
                const buffer = {
                    binding: node.binding,
                    visibility,
                    buffer: {
                        type: (isReturned || node.isModified) ? 'storage' : 'read-only-storage'
                    }
                };
                bufferIncr++;
                
                if(this.bindings?.[node.name]) Object.assign(buffer,this.bindings[node.name]); //overrides
                return buffer;
            }
        }).filter((v,i) => { if(v) return true; }) : [];

        if(this.bindings) {
            for(const key in this.bindings) {
                if(!assignedEntries[key])
                    entries.push(this.bindings[key]); //push any extra bindings (e.g. if we're forcing our own bindings, but they must be complete!)
            }
        }

        //console.trace( entries )
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

            this.pipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts:this.bindGroupLayouts.filter(v => {if(v) return true;}) //this should have the combined compute and vertex/fragment (and accumulated) layouts
            });
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
                        typeof vertices.vertex?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.vertex) : vertices.vertex,
                        typeof vertices.color?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.color) : vertices.color,
                        typeof vertices.uv?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.uv) : vertices.uv,
                        typeof vertices.normal?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.normal) : vertices.normal,
                    );
                }
                else vertices = new Float32Array(typeof vertices === 'object' ? ShaderHelper.flattenArray(vertices) : vertices);
            }

            if(bufferGroup.vertexBuffers?.[index]?.size !== vertices.byteLength) {
                if(!bufferGroup.vertexBuffers) bufferGroup.vertexBuffers = [] as any[];
                
                if(!bufferGroup.vertexCount) bufferGroup.vertexCount = vertices.length / 13;

                const vertexBuffer = this.device.createBuffer({
                    size: vertices.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 
                    //assume read/write
                });
                bufferGroup.vertexBuffers[index] = vertexBuffer;
            }

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

    updateTexture = (data:{
        source?:ImageBitmap|any,
        texture?:GPUTextureDescriptor,
        
        width:number, 
        height:number, 
        bytesPerRow?:number,
        label?:string, 
        format?:string, //default: 'rgba8unorm' 
        usage?:any
    }|ImageBitmap|any, 
    name:string, bindGroupNumber=this.bindGroupNumber) => {
        if(!data) return;
        if(!data.width && data.source) data.width = data.source.width;
        if(!data.height && data.source) data.height = data.source.height;

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if(!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber)
        }

        bufferGroup.textures[name] = this.device.createTexture(data.texture ? data.texture : {
            label:  data.label ? data.label :`texture_g${bindGroupNumber}_${name}`,
            format: data.format ? data.format : 'rgba8unorm',
            size: [data.width, data.height, 1],
            usage:  data.usage ? data.usage : 
                data.source ? 
                    (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT) : 
                    (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) //GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | 
        } as GPUTextureDescriptor);

        let texInfo = {} as any;
        if(data.source) texInfo.source = data.source;
        else texInfo.source = data; 

        //todo: more texture settings and stuff
        if(texInfo.texture)
            this.device.queue.writeTexture(
                texInfo,
                bufferGroup.textures[name],
                { 
                    bytesPerRow: data.bytesPerRow ? data.bytesPerRow : data.width * 4 
                },
                { 
                    width: data.width, 
                    height: data.height 
                },
            );
        else if (texInfo.source)
            this.device.queue.copyExternalImageToTexture(
                texInfo, //e.g. an ImageBitmap
                { texture: bufferGroup.textures[name] },
                [data.width, data.height],
            );

        //todo: we need to pass the updated sampler and texture view to the bindGroupLayout
        return true; //textures/samplers updated
    }

    setUBOposition = (dataView:DataView, inputTypes, typeInfo, offset, input, inpIdx) => { //utility function, should clean up later (i.e. provide the values instead of objects to reference)
        // Ensure the offset is aligned correctly
        offset = Math.ceil(offset / typeInfo.alignment) * typeInfo.alignment;
        if(input !== undefined) {
            if (inputTypes[inpIdx].type.startsWith('vec')) {
                const vecSize = typeInfo.size / 4;
                for (let j = 0; j < vecSize; j++) {
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
                        dataView.setUint32(offset, input, true); 
                        break;
                        break;
                    case 'i16':
                        dataView.setInt16(offset, input, true); 
                        break;
                    case 'u16':
                        dataView.setUint16(offset, input, true); 
                        break;
                    case 'i8':
                        dataView.setInt8(offset, input);
                        break;
                    case 'u8':
                        dataView.setUint8(offset, input); 
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
            //console.log(bufferGroup.uniformBuffer)
            // Use a DataView to set values at specific byte offsets
            const dataView = bufferGroup.uniformBuffer.mapState === 'mapped' ? 
                new DataView(bufferGroup.uniformBuffer.getMappedRange()) :
                new DataView(new Float32Array(bufferGroup.uniformBuffer.size/4).buffer); //little endian
    
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

            //console.log(inputs, new Float32Array(dataView.buffer)); //check validity
            if(bufferGroup.uniformBuffer.mapState === 'mapped') bufferGroup.uniformBuffer.unmap();
            // else {
            //     this.device.queue.writeBuffer(
            //         bufferGroup.uniformBuffer,
            //         0,
            //         dataView,
            //         dataView.byteOffset,
            //         bufferGroup.uniformBuffer.size/4
            //     )
            // }

        }

        if(bufferGroup.defaultUniforms) { //update built-in uniforms (you can add whatever you want to the builtInUniforms list)
            // Use a DataView to set values at specific byte offsets
            const dataView = bufferGroup.defaultUniformBuffer.mapState === 'mapped' ? 
                new DataView(bufferGroup.defaultUniformBuffer.getMappedRange()) :
                new DataView(new Float32Array(bufferGroup.defaultUniformBuffer.size).buffer); //little endian
            let offset = 0; // Initialize the offset

            bufferGroup.defaultUniforms.forEach((u,i) => { 
                let value = this.builtInUniforms[u]?.callback(this);
                const typeInfo = WGSLTypeSizes[this.builtInUniforms[bufferGroup.defaultUniforms[i]].type];
                offset = this.setUBOposition(dataView,inputTypes,typeInfo,offset,value,i);
            });

            if(bufferGroup.defaultUniformBuffer.mapState === 'mapped') bufferGroup.defaultUniformBuffer.unmap();
            // else {
            //     this.device.queue.writeBuffer(
            //         bufferGroup.defaultUniformBuffer,
            //         0,
            //         dataView,
            //         dataView.byteOffset,
            //         bufferGroup.defaultUniformBuffer.size
            //     )
            // }
        } 
    }


    createRenderPipelineDescriptor = (
        nVertexBuffers=1, 
        swapChainFormat = navigator.gpu.getPreferredCanvasFormat(),
        renderPipelineDescriptor:Partial<GPURenderPipelineDescriptor>={}
    ) => {

        // 5: Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
        const vertexBuffers = Array.from({length:nVertexBuffers}, (_,i) => {
            return {
                arrayStride: 52,
                attributes: [
                    {format: "float32x4", offset: 0, shaderLocation:  4*i},   //vertex vec4
                    {format: "float32x4", offset: 16, shaderLocation: 4*i+1}, //color vec4
                    {format: "float32x2", offset: 32, shaderLocation: 4*i+2}, //uv vec2
                    {format: "float32x3", offset: 40, shaderLocation: 4*i+3}  //normal vec3
                ]
            }
        });
        
        let desc = { //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
            layout: this.pipelineLayout ? this.pipelineLayout : 'auto',
            vertex: this.vertex ? {
                module: this.vertex.shaderModule,
                entryPoint: 'vtx_main',
                buffers: vertexBuffers
            } : {
                module: this.shaderModule,
                entryPoint: 'vtx_main',
                targets: [{
                    format: swapChainFormat
                }]
            },
            fragment: this.vertex ? {
                module: this.shaderModule,
                entryPoint: 'frag_main',
                targets: [{
                    format: swapChainFormat
                }]
            } : undefined,
            depthStencil: {
                format: "depth24plus", 
                depthWriteEnabled: true, 
                depthCompare: "less"
            }
        } as GPURenderPipelineDescriptor;
        if(!this.vertex) delete renderPipelineDescriptor.fragment;
        renderPipelineDescriptor = Object.assign(desc, renderPipelineDescriptor); //just overwrite defaults in this case so we can pass specifics in)

        return renderPipelineDescriptor;
    }

    createRenderPassDescriptor = () => {
        
        //const view = (this.context as GPUCanvasContext)?.getCurrentTexture().createView();
        const depthTexture = this.device.createTexture({
            //allows 3D rendering
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        return { //some assumptions. todo: unassume
            colorAttachments: [{
                view: undefined,//view,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                loadOp: "clear",
                storeOp: "store" //discard
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store", //discard
                // stencilLoadOp: "clear",
                // stencilClearValue: 0,
                // stencilStoreOp: "store"
            }
        } as GPURenderPassDescriptor;
    }

    updateGraphicsPipeline = (
        nVertexBuffers=1, 
        contextSettings?:GPUCanvasConfiguration, 
        renderPipelineDescriptor?:Partial<GPURenderPipelineDescriptor>,
        renderPassDescriptor?:GPURenderPassDescriptor
    ) => {
        // Setup render outputs
        const swapChainFormat = navigator.gpu.getPreferredCanvasFormat();

        (this.context as GPUCanvasContext)?.configure(contextSettings ? contextSettings : {
            device: this.device, 
            format: swapChainFormat, 
            //usage: GPUTextureUsage.RENDER_ATTACHMENT,
            alphaMode: 'premultiplied'
        });

        renderPipelineDescriptor = this.createRenderPipelineDescriptor(nVertexBuffers, swapChainFormat, renderPipelineDescriptor);

        if(!renderPassDescriptor)
            renderPassDescriptor = this.createRenderPassDescriptor();

        this.renderPassDescriptor = renderPassDescriptor;

        this.graphicsPipeline = this.device.createRenderPipeline(renderPipelineDescriptor as GPURenderPipelineDescriptor); 
            
        // const canvasView = this.device.createTexture({
        //     size: [this.canvas.width, this.canvas.height],
        //     sampleCount:4,
        //     format: navigator.gpu.getPreferredCanvasFormat(),
        //     usage: GPUTextureUsage.RENDER_ATTACHMENT,
        // });

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
        bufferGroup.bindGroupLayoutEntries = this.bindGroupLayoutEntries;

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
        const params = bufferGroup.params;

        const inputTypes = bufferGroup.inputTypes;
        let newBindGroupBuffer;
        if(inputBuffers?.length > 0) {
            inputs.forEach((inp,index) => {
                if(inp && inp?.length) {
                    if(inputBuffers.size !== inp.length * inputTypes[index].byteSize) {
                        newBindGroupBuffer = true;
                    }
                }
            });
        } else newBindGroupBuffer = true; //will trigger bindGroups to be set


        if(textures) {
            const entries = this.createBindGroupEntries(textures,bindGroupNumber, (this.vertex || (!this.vertex && this.graphicsPipeline)) ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT : undefined);
            this.bindGroupLayoutEntries = entries;
            bufferGroup.bindGroupLayoutEntries = entries;
            this.setBindGroupLayout(entries, bindGroupNumber); //we need to reset the sampler and texture data on the bindGroup
            newBindGroupBuffer = true; // make sure a new bindGroup is made with updated buffers
        }

        let uBufferPushed = false;
        let inpBuf_i = 0; let inpIdx = 0;
        let hasUniformBuffer = 0;
        let uBufferSet = false;

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
                    if (!bufferGroup.uniformBuffer || (!uBufferSet && inputs[inpBuf_i] !== undefined)) {

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
                        uBufferSet = true;
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
                    if (typeof inputs[inpBuf_i] !== 'undefined' || (typeof inputs[inpBuf_i] !== 'undefined' && !inputBuffers[inpBuf_i])) {
                        
                        if(!inputs?.[inpBuf_i]?.byteLength && Array.isArray(inputs[inpBuf_i]?.[0])) inputs[inpBuf_i] = ShaderHelper.flattenArray(inputs[inpBuf_i]);
                        if(inputBuffers[inpBuf_i] as GPUBuffer && inputs[inpBuf_i].length === inputBuffers[inpBuf_i].size/4) {
                            let buf = new Float32Array(inputs[inpBuf_i]);
                            this.device.queue.writeBuffer(
                                inputBuffers[inpBuf_i],
                                0,
                                buf,
                                buf.byteOffset,
                                buf.length || 8
                            );
                            inputBuffers[inpBuf_i].unmap();
                        }
                        else {
                            inputBuffers[inpBuf_i] = (
                                this.device.createBuffer({
                                    size:  inputs[inpBuf_i] ? (inputs[inpBuf_i].byteLength ? inputs[inpBuf_i].byteLength : inputs[inpBuf_i]?.length ? inputs[inpBuf_i].length*4 : 8) : 8,
                                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                                    mappedAtCreation: true
                                })  
                            );
                            
                            //console.log(inputs[inpBuf_i])
                            new Float32Array(inputBuffers[inpBuf_i].getMappedRange()).set(inputs[inpBuf_i]);
                            inputBuffers[inpBuf_i].unmap();
                        }
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
                outputBuffers.push(bufferGroup.textures[key])
            }
        }

        //run the buffer() call now for each group tied to each shader based on load order //todo: fix
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

            //if(!bufferGroup.defaultUniformBuffer) {
            bufferGroup.defaultUniformBuffer = this.device.createBuffer({
                size: bufferGroup.totalDefaultUniformBufferSize, // This should be the sum of byte sizes of all uniforms
                usage: GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_SRC,
                mappedAtCreation:true
            });

            if(!bufferGroup.defaultUniformBinding) {
                bufferGroup.defaultUniformBinding = inputBuffers.length; //latest binding in series
            }
            //}
        }
        
        //console.log(uniformValues)
        if(uniformValues.length > 0) this.updateUBO(uniformValues, inputTypes, bindGroupNumber);
        
        if(this.bindGroupLayouts[bindGroupNumber] && newBindGroupBuffer) {
            // Update bind group creation to include input buffer resources
            let bindGroupEntries = [];
            if(bufferGroup.bindGroupLayoutEntries)  {
                bindGroupEntries.push(...bufferGroup.bindGroupLayoutEntries);
                let inpBufi = 0;
                bufferGroup.bindGroupLayoutEntries.forEach((entry,i) => {
                    let type = entry.buffer?.type;
                    if((type && (type.includes('storage') || type.includes('uniform'))) && inputBuffers[inpBufi]) {
                        entry.resource = { buffer: inputBuffers[inpBufi] }
                        inpBufi++;
                    }
                });
            } else if(inputBuffers) bindGroupEntries.push(...inputBuffers.map((buffer, index) => ({
                binding: index,
                resource: { buffer }
            }))); 

            
            if(bufferGroup.defaultUniformBuffer) bindGroupEntries.push({
                binding: bufferGroup.defaultUniformBinding, 
                resource: {buffer:bufferGroup.defaultUniformBuffer}
            });
            
            
            //console.log(bindGroupEntries)
            const bindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayouts[bindGroupNumber],
                entries: bindGroupEntries
            });

            bufferGroup.bindGroup = bindGroup;
            this.bindGroups[bindGroupNumber] = bindGroup;

        }

        return newBindGroupBuffer;
        
    }

    getOutputData = (commandEncoder:GPUCommandEncoder, outputBuffers?) => {
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
            if(outputBuffer.width) {
                commandEncoder.copyTextureToBuffer( //easier to copy the texture to an array and reuse it that way
                    outputBuffer,
                    stagingBuffers[index],
                    [outputBuffer.width,outputBuffer.height,outputBuffer.depthOrArrayLayers]
                );
            } else commandEncoder.copyBufferToBuffer(
                outputBuffer, 0,
                stagingBuffers[index], 0,
                outputBuffer.size
            );
        });

        this.device.queue.submit([commandEncoder.finish()]);

        const promises = stagingBuffers.map((buffer,i) => {
            return new Promise((resolve) => {
                buffer.mapAsync(GPUMapMode.READ).then(() => {
                    const mappedRange = buffer.getMappedRange();
                    const rawResults = outputBuffers[i].format?.includes('8') ? new Uint8Array(mappedRange) : new Float32Array(mappedRange); 
                    const copiedResults = outputBuffers[i].format?.includes('8') ? new Uint8Array(rawResults.length) : new Float32Array(rawResults.length);
                    
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
                    const view = (this.context as GPUCanvasContext).getCurrentTexture().createView();
                    this.renderPassDescriptor.colorAttachments[0].view = view

                    renderPass = commandEncoder.beginRenderPass(this.renderPassDescriptor);
                }

                if(vertexCount) bufferGroup.vertexCount = vertexCount;
                else if(!bufferGroup.vertexCount) bufferGroup.vertexCount = 1;

                if(!useRenderBundle || !bufferGroup.renderBundle) { //drawIndirect?
                    renderPass.setPipeline(this.graphicsPipeline);
                    
                    const withBindGroup = (group,i) => {
                        renderPass.setBindGroup(i,group);
                    }

                    this.bindGroups.forEach(withBindGroup);
                    
                    if(!bufferGroup.vertexBuffers) this.updateVBO({color:new Array(bufferGroup.vertexCount*4).fill(0)}, 0); //put a default in to force it to run a single pass
                    
                    if(bufferGroup.vertexBuffers) 
                        bufferGroup.vertexBuffers.forEach((vbo,i) => {
                            renderPass.setVertexBuffer(i, vbo)
                        });
                    
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
            } else {
                this.device.queue.submit([commandEncoder.finish()]);
                return new Promise((r) => r(true));
            }
            
        }
        
    }

}

      
function isTypedArray(x) { //https://stackoverflow.com/a/40319428
    return (ArrayBuffer.isView(x) && Object.prototype.toString.call(x) !== "[object DataView]");
}
