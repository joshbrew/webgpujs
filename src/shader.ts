import { WGSLTranspiler, WGSLTypeSizes } from "./transpiler";
import { ShaderOptions, RenderOptions, ComputeOptions, RenderPassSettings, ComputePassSettings, TranspiledShader, BufferGroup, TextureInfo, Param } from './types'
import { combineVertices, flattenArray, floatToHalf, isTypedArray, splitVertices,  } from './util'

//Self contained shader execution boilerplate
export class ShaderHelper {

    prototypes: {
        compute?: TranspiledShader,
        fragment?: TranspiledShader,
        vertex?: TranspiledShader,
    } = {};

    options: any = {};

    compute?: ShaderContext;
    vertex?: ShaderContext;
    fragment?: ShaderContext;

    process = (...inputs: any[]) => {
        const shader = this.compute;
        if (shader)
            return shader.run(this.compute.computePass, ...inputs)
    };

    render = (renderPass?: RenderPassSettings, ...inputs: any[]) => {
        const shader = this.fragment ? this.fragment : this.vertex;
        if (shader)
            return shader.run(renderPass ? renderPass : shader.renderPass ? shader.renderPass : { vertexCount: 1 }, ...inputs);
    };

    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: GPUCanvasContext | OffscreenRenderingContext;
    device: GPUDevice;
    functions: (Function | string)[] = [];

    //copy these to new ShaderHelpers to share buffers between shaders
    bindGroupLayouts: GPUBindGroupLayout[] = [];
    bindGroups: GPUBindGroup[] = [];
    bufferGroups: BufferGroup[] = [];

    constructor(
        shaders: {
            compute?: TranspiledShader,
            fragment?: TranspiledShader,
            vertex?: TranspiledShader
        },
        options: ShaderOptions & ComputeOptions & RenderOptions
    ) {
        if (shaders) this.init(shaders, options);
    }

    init = (
        shaders: {
            compute?: TranspiledShader;
            fragment?: TranspiledShader;
            vertex?: TranspiledShader;
        },
        options: ShaderOptions & ComputeOptions & RenderOptions = {}
    ) => {
        Object.assign(this, options);
        if (!this.device) throw new Error(
            `No GPUDevice! Please retrieve e.g. via:
      
      const gpu = navigator.gpu;
      const adapter = await gpu.requestAdapter();
      if(!adapter) throw new Error('No GPU Adapter found!');
      device = await adapter.requestDevice();
      shaderhelper.init(shaders,{device});`
        );
        options.device = options.device || this.device;

        if (shaders.fragment && !shaders.vertex) {
            shaders = this.generateShaderBoilerplate(shaders, options);
        }

        if (!options.skipCombinedBindings) {
            const pairs: [keyof typeof shaders, keyof typeof shaders][] = [
                ['compute', 'vertex'],
                ['compute', 'fragment'],
                ['vertex', 'fragment'],
            ];
            pairs.forEach(([a, b]) => {
                if (shaders[a] && shaders[b]) {
                    const combined = WGSLTranspiler.combineBindings(
                        shaders[a].code,
                        shaders[b].code,
                        true,
                        shaders[b].params
                    );
                    shaders[a].code = combined.code1;
                    shaders[a].altBindings =
                        Object.keys(combined.changes1).length
                            ? combined.changes1
                            : undefined;
                    shaders[b].code = combined.code2;
                    shaders[b].altBindings =
                        Object.keys(combined.changes2).length
                            ? combined.changes2
                            : undefined;
                }
            });
            if (shaders.vertex?.params && shaders.fragment) {
                shaders.fragment.params = shaders.vertex.params;
            }
        }

        Object.assign(this.prototypes, shaders);
        Object.assign(this.options, options);

        ['compute', 'fragment', 'vertex'].forEach((type) => {
            if (shaders[type]) {
                this[type] = new ShaderContext(
                    Object.assign({}, shaders[type], options)
                );
                this[type].helper = this;
            }
        });
        if (shaders.vertex && shaders.fragment) {
            WGSLTranspiler.combineShaderParams(shaders.vertex, shaders.fragment);
        }

        // Bind group layout setup for compute and render contexts
        (['compute', 'fragment'] as const).forEach((type) => {
            const ctx =
                this[type] || (type === 'fragment' ? this.vertex : undefined);
            if (!ctx) return;
            ctx.bindGroupLayouts = this.bindGroupLayouts;
            ctx.bindGroups = this.bindGroups;
            ctx.bufferGroups = this.bufferGroups;
            const entries = ctx.createBindGroupEntries(
                options.renderPass?.textures,
                undefined,
                type === 'compute'
                    ? undefined
                    : GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
            );
            ctx.bindGroupLayoutEntries = entries.length ? entries : undefined;
            ctx.setBindGroupLayout(entries, options.bindGroupNumber);
        });

        // Shader modules and pipelines
        if (this.compute) {
            this.compute.shaderModule = this.device.createShaderModule({
                code: shaders.compute.code,
            });
            if (
                (this.compute.bindGroupLayoutEntries || this.compute.altBindings) &&
                this.bindGroupLayouts.length
            ) {
                this.compute.pipelineLayout = this.device.createPipelineLayout({
                    label: 'computeRenderPipelineDescriptor',
                    bindGroupLayouts: this.bindGroupLayouts.filter((v) => v),
                });
            }
            const pipeline: GPUComputePipelineDescriptor = {
                layout: this.compute.pipelineLayout
                    ? this.compute.pipelineLayout
                    : 'auto',
                compute: {
                    module: this.compute.shaderModule,
                    entryPoint: 'compute_main',
                },
                ...(options.computePipelineSettings || {}),
            };
            this.compute.computePipeline = this.device.createComputePipeline(
                pipeline
            );
        }

        ['vertex', 'fragment'].forEach((type) => {
            if (this[type]) {
                this[type].shaderModule = this.device.createShaderModule({
                    code: shaders[type].code,
                });
            }
        });

        // Graphics pipeline: prefer fragment, fallback to vertex
        const gpCtx = this.fragment || this.vertex;
        if (gpCtx) {
            if (this.fragment) gpCtx.vertex = this.vertex;
            if (
                (gpCtx.bindGroupLayoutEntries || gpCtx.altBindings) &&
                this.bindGroupLayouts.length
            ) {
                gpCtx.pipelineLayout = this.device.createPipelineLayout({
                    label: `${this.fragment ? 'fragment' : 'vertex'
                        }RenderPipelineDescriptor`,
                    bindGroupLayouts: this.bindGroupLayouts.filter((v) => v),
                });
            }
            gpCtx.updateGraphicsPipeline(
                options.renderPass?.vbos as any,
                options.contextSettings,
                options.renderPipelineDescriptor,
                options.renderPassDescriptor,
                this.fragment ? undefined : 'vertex'
            );
        }
    }


    addFunction = (func: Function | string) => {
        this.functions.push(func);
        for (const key of ['compute', 'fragment', 'vertex']) {
            if (this.prototypes[key])
                Object.assign(this.prototypes[key],
                    WGSLTranspiler.convertToWebGPU( //just recompile the pipeline with current settings
                        this.prototypes[key].funcStr,
                        key as any,
                        this.prototypes[key].bindGroupNumber,
                        this.options?.renderPass?.vbos,
                        this.options?.workGroupSize,
                        this.functions,
                        this.options?.variableTypes,
                        this.options?.renderPass?.textures
                    )
                );
        }
        this.init(this.prototypes, { skipCombinedBindings: true });
    }

    generateShaderBoilerplate = (shaders, options) => {

        for (const shaderType of ['compute', 'vertex', 'fragment']) {

            const shaderContext = shaders[shaderType];
            if (!shaderContext) continue;

            if (shaderContext && shaderType === 'fragment' && !shaders.vertex) {
                let vboInputStrings = [] as any[];

                let vboStrings = [];
                if (options.vbos) {
                    const types = [];
                    const keys = []; options.vbos.forEach((obj) => {
                        keys.push(...Object.keys(obj));
                        types.push(...Object.values(obj));
                    });

                    let loc = 0;
                    for (const key of keys) {
                        const type = types[loc];

                        vboStrings.push(
                            `@location(${loc}) ${key}: ${type}${loc === keys.length - 1 ? '' : ','}`
                        );

                        //if(shaderType === 'vertex') {   
                        vboInputStrings.push(
                            `@location(${loc}) ${key}In: ${type}${loc === keys.length - 1 ? '' : ','}`
                        );
                        //}

                        loc++;
                    }
                }


                this.vertex = {
                    code: `
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
        if (this.device) this.device.destroy(); //destroys all info associated with pipelines on this device
        if (this.context) (this.context as GPUCanvasContext)?.unconfigure();
    }


    static flattenArray = flattenArray;

    //we're just assuming that for the default frag/vertex we may want colors, positions, normals, or uvs. If you define your entire own shader pipeline then this can be ignored
    static combineVertices = combineVertices;

    static splitVertices = splitVertices;

}




export class ShaderContext {

    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: GPUCanvasContext | OffscreenRenderingContext;
    device: GPUDevice;
    helper: ShaderHelper;
    vertex?: ShaderContext; //The vertex shader context if this is a fragment shader

    code: string;
    header: string;
    ast: any[];

    params: Param[];

    funcStr: string;
    defaultUniforms: any;
    type: "compute" | "vertex" | "fragment";
    workGroupSize: number = 64;
    returnedVars?: any[];

    functions;

    shaderModule?: GPUShaderModule;
    pipelineLayout?: GPUPipelineLayout;

    computePass?: ComputePassSettings;
    renderPass?: RenderPassSettings;

    computePipeline?: GPUComputePipeline;
    graphicsPipeline?: GPURenderPipeline;
    depthTexture: GPUTexture;

    renderPassDescriptor: GPURenderPassDescriptor;

    indexBuffer: GPUBuffer;
    indexFormat: string;
    contextSettings: any;

    altBindings: any;

    builtInUniforms: any;

    bufferGroup: BufferGroup;
    bufferGroups: BufferGroup[] = [];

    bindings?: Partial<GPUBindGroupLayoutEntry>[];
    bindGroups: GPUBindGroup[] = [];
    bindGroupLayouts: GPUBindGroupLayout[] = [];

    bindGroupNumber: number;
    bindGroupLayout: GPUBindGroupLayout;
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];

    vertexBufferOptions: { [key: string]: string }[];

    constructor(props?) {
        Object.assign(this, props);

        const bIUCopy = {};
        for (const key in WGSLTranspiler.builtInUniforms) {
            bIUCopy[key] = Object.assign({}, WGSLTranspiler.builtInUniforms[key]);
        }

        this.builtInUniforms = bIUCopy;

    }

    // Extract all returned variables from the function string
    createBindGroupEntries = (
        textures?: { [key: string]: TextureInfo },
        bindGroupNumber = this.bindGroupNumber,
        visibility = GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT
    ) => {
        let bufferIncr = 0;
        let uniformBufferIdx;

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        let texKeys = []; let texKeyRot = 0; let baseMipLevel = 0;
        if (bufferGroup.textures) texKeys = Object.keys(bufferGroup.textures);
        let assignedEntries = {};

        const entries = bufferGroup.params ? bufferGroup.params.map((node, i) => {
            if (node.group !== bindGroupNumber) return undefined;

            if (textures?.[node.name]) {

                if (textures[node.name].source || textures[node.name].buffer || textures[node.name] instanceof ImageBitmap) {
                    if (node.isStorageTexture) textures[node.name].isStorage = true;
                    this.updateTexture(textures[node.name], node.name, bindGroupNumber); //generate texture buffers and samplers
                    //texturesUpdated = true;
                    if (!texKeys.includes(node.name))
                        texKeys.push(node.name);
                }
            }

            assignedEntries[node.name] = true;
            let isReturned = node.isReturned;
            if (node.isUniform) {
                if (typeof uniformBufferIdx === 'undefined') {
                    uniformBufferIdx = node.binding;
                    bufferIncr++;
                    const buffer = {
                        name: 'uniform', //custom label for us to refer to
                        binding: uniformBufferIdx,
                        visibility,
                        buffer: {
                            type: 'uniform'
                        }
                    } as GPUBindGroupLayoutEntry;
                    if (this.bindings?.[node.name]) Object.assign(buffer, this.bindings[node.name]); //overrides
                    return buffer;
                } else return undefined;
            } else if (node.isTexture || node.isStorageTexture) { //rudimentary storage texture checks since typically they'll share bindings
                const buffer = {
                    name: node.name, //custom label for us to refer to
                    binding: node.binding,
                    visibility
                } as GPUBindGroupLayoutEntry;
                if (node.isDepthTexture) buffer.texture = { sampleType: 'depth' };
                else if (bufferGroup.textures?.[node.name]) {
                    buffer.texture = {
                        sampleType: 'float',
                        viewDimension: node.name.includes('3d') ? '3d' : node.name.includes('1d') ? '1d' : node.name.includes('2darr') ? '2d-array' : '2d'
                    };

                    let viewSettings = undefined;
                    if (bufferGroup.textures[node.name]) {
                        if (bufferGroup.textures[node.name].mipLevelCount) {
                            if (!viewSettings) viewSettings = {};
                            viewSettings.baseMipLevel = baseMipLevel;
                            viewSettings.mipLevelCount = bufferGroup.textures[node.name].mipLevelCount
                            baseMipLevel++;
                        }
                    }

                    (buffer as any).resource = bufferGroup.textures?.[node.name] ? bufferGroup.textures[node.name].createView(viewSettings) : {} //todo: texture dimensions/format/etc customizable
                } else if (node.isStorageTexture && !node.isSharedStorageTexture) {
                    buffer.storageTexture = { //placeholder stuff but anyway you can provide your own bindings as the inferencing is a stretch after a point
                        access: 'write-only', //read-write only in chrome beta, todo: replace this when avaiable in production
                        format: bufferGroup.textures[node.name]?.format ? bufferGroup.textures[node.name].format : 'rgba8unorm',
                        viewDimension: node.name.includes('3d') ? '3d' : node.name.includes('1d') ? '1d' : node.name.includes('2darr') ? '2d-array' : '2d'
                    };
                } else { //IDK
                    buffer.texture = { sampleType: 'unfilterable-float' }
                }
                if (this.bindings?.[node.name]) Object.assign(buffer, this.bindings[node.name]); //overrides
                bufferIncr++;
                return buffer;
            } else if (node.isSampler) { //todo, we may want multiple samplers, need to separate texture and sampler creation
                if (!bufferGroup.samplers?.[node.name]) {
                    const sampler = this.device.createSampler(
                        (texKeys && bufferGroup.textures[node.name]) ?
                            bufferGroup.textures[node.name] : {
                                magFilter: 'linear',
                                minFilter: 'linear',
                                mipmapFilter: "linear",
                                // addressModeU: "repeat",
                                // addressModeV: "repeat"
                            }
                    );

                    if (!bufferGroup.samplers) bufferGroup.samplers = {};
                    bufferGroup.samplers[node.name] = sampler;

                }

                const buffer = {
                    name: node.name, //custom label for us to refer to
                    binding: node.binding,
                    visibility,
                    sampler: {},
                    resource: bufferGroup.samplers[node.name] || {}
                } as GPUBindGroupLayoutEntry;

                texKeyRot++; if (texKeyRot >= texKeys?.length) texKeyRot = 0;
                bufferIncr++;

                if (this.bindings?.[node.name]) Object.assign(buffer, this.bindings[node.name]); //overrides
                return buffer;
            } else {
                const buffer = {
                    name: node.name, //custom label for us to refer to
                    binding: node.binding,
                    visibility,
                    buffer: {
                        type: (isReturned || node.isModified) ? 'storage' : 'read-only-storage'
                    }
                } as GPUBindGroupLayoutEntry;
                bufferIncr++;

                if (this.bindings?.[node.name]) Object.assign(buffer, this.bindings[node.name]); //overrides
                return buffer;
            }
        }).filter((v, i) => { if (v) return true; }) : [];

        if (this.bindings) {
            for (const key in this.bindings) {
                if (!assignedEntries[key])
                    entries.push(this.bindings[key] as GPUBindGroupLayoutEntry); //push any extra bindings (e.g. if we're forcing our own bindings, but they must be complete!)
            }
        }

        //console.trace( entries )
        if (bufferGroup.defaultUniforms) { //the last binding is our default uniforms
            entries.push({
                name: 'defaultUniforms',
                binding: bufferIncr,
                visibility,
                buffer: {
                    type: 'uniform'
                }
            } as GPUBindGroupLayoutEntry)
        }

        //console.log(entries);

        this.bindGroupLayoutEntries = entries;
        return entries as GPUBindGroupLayoutEntry[];
    }

    setBindGroupLayout = (entries = [], bindGroupNumber = this.bindGroupNumber) => {
        if (entries.length > 0) {
            this.bindGroupLayout = this.device.createBindGroupLayout({
                entries
            });
            this.bindGroupLayouts[bindGroupNumber] = this.bindGroupLayout;

            this.pipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts: this.bindGroupLayouts.filter(v => { if (v) return true; }) //this should have the combined compute and vertex/fragment (and accumulated) layouts
            });
        }
        return this.bindGroupLayout;
    }




    updateTextures = (
        textures: { [key: string]: TextureInfo },
        updateBindGroup = false,
        bindGroupNumber = this.bindGroupNumber
    ) => {

        if (!textures) return;

        let bufferGroup = this.bufferGroup;
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        //this will call updateTexture respectively
        const entries = this.createBindGroupEntries(
            textures,
            bindGroupNumber,
            (this.vertex || (!this.vertex && this.graphicsPipeline)) ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT : undefined
        );
        this.bindGroupLayoutEntries = entries;
        bufferGroup.bindGroupLayoutEntries = entries;
        this.setBindGroupLayout(entries, bindGroupNumber); //we need to reset the sampler and texture data on the bindGroup

        //we need to pass the updated buffer info to the bind group to locate the new data correctly in the shader before rerendering
        if (updateBindGroup)
            this.updateBindGroup(bindGroupNumber);
    }

    updateTexture = (
        data: TextureInfo | ImageBitmap | any,
        name: string,
        bindGroupNumber = this.bindGroupNumber
    ) => {
        if (!data) return;
        if (!data.width && data.source) data.width = data.source.width;
        if (!data.height && data.source) data.height = data.source.height;

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        const defaultDescriptor = {
            label: data.label ? data.label : name,
            format: data.format ? data.format : 'rgba8unorm',
            size: [data.width, data.height, 1],
            usage: data.usage ? data.usage :
                data.source ?
                    (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | (data.isStorage ? GPUTextureUsage.STORAGE_BINDING : GPUTextureUsage.RENDER_ATTACHMENT)) :
                    data.isStorage ? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING) : (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST) //GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | 
        } as GPUTextureDescriptor;

        const texture = this.device.createTexture(
            data.texture ? Object.assign(defaultDescriptor, data.texture) : defaultDescriptor
        );

        if (bufferGroup.textures[name]) bufferGroup.textures[name].destroy();
        bufferGroup.textures[name] = texture;
        //console.log(texture);

        let texInfo = {} as any;

        if (data.source) texInfo.source = data.source;
        else if (data instanceof ImageBitmap) texInfo.source = data;
        else if (data.buffer) {
            texInfo.texture = texture;
            if (data.mipLevelCount) {
                texInfo.mipLevel = data.mipLevelCount;
            }
        }

        if (data.layout) Object.assign(texInfo, data.layout);
        //todo: more texture settings and stuff
        if (data.buffer)
            this.device.queue.writeTexture(
                texInfo as GPUImageCopyTexture,
                data.buffer,
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
                texInfo as GPUImageCopyExternalImage, //e.g. an ImageBitmap
                { texture },
                [data.width, data.height],
            );
        //console.log(texInfo,data);



        return true; //textures/samplers updated
    }

    setUBOposition = (dataView: DataView, typeInfo: { type: string, size: number, alignment: number }, offset: number, input: any) => { //utility function, should clean up later (i.e. provide the values instead of objects to reference)
        // Ensure the offset is aligned correctly
        offset = Math.ceil(offset / typeInfo.alignment) * typeInfo.alignment;
        if (input !== undefined) {
            if (typeInfo.type.startsWith('vec')) {
                const vecSize = typeInfo.size / 4;
                for (let j = 0; j < vecSize; j++) {
                    if (typeInfo.type.includes('f')) dataView.setFloat32(offset + j * 4, input[j], true);
                    else dataView.setInt32(offset + j * 4, input[j], true);
                }
            } else if (typeInfo.type.startsWith('mat')) {
                const flatMatrix = typeof input[0] === 'object' ? ShaderHelper.flattenArray(input) : input;
                for (let j = 0; j < flatMatrix.length; j++) {
                    dataView.setFloat32(offset + j * 4, flatMatrix[j], true); //we don't have Float16 in javascript :-\
                }
            } else {
                switch (typeInfo.type) {
                    case 'f32':
                    case 'f':
                        dataView.setFloat32(offset, input, true); // true for little-endian
                        break;
                    case 'i32':
                    case 'i':
                        dataView.setInt32(offset, input, true);
                        break;
                    case 'u32':
                    case 'u':
                        dataView.setUint32(offset, input, true);
                        break;
                    case 'f16':
                    case 'h':
                        dataView.setUint16(offset, floatToHalf(input), true);
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

    updateArrayBuffers(
        buffers: { [key: string]: any },  //update by name
        updateBindGroup = false,
        bindGroupNumber = this.bindGroupNumber
    ) {

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        const inputBuffers = bufferGroup?.inputBuffers;

        for (const key in buffers) {

            if (buffers[key] instanceof GPUBuffer) {
                inputBuffers[key] = buffers[key]; //preallocated
            } else {

                let isReturned = bufferGroup.returnedVars.find((v) => {
                    if (v === key) return true;
                });

                const usage = isReturned ?
                    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX :
                    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX


                inputBuffers[key] = (
                    this.device.createBuffer({
                        label: key,
                        size: buffers[key] ? (buffers[key].byteLength ? buffers[key].byteLength : buffers[key]?.length ? buffers[key].length * 4 : 8) : 8,
                        usage,
                        mappedAtCreation: true
                    })
                );

                //console.log(buffers[key])
                new Float32Array(inputBuffers[key].getMappedRange()).set(buffers[key]);
                inputBuffers[key].unmap();
            }

        }

        if (updateBindGroup) {
            this.updateBindGroup(bindGroupNumber);
        }


    }

    //right now we just associate one uniform buffer per bind group
    updateUBO = (
        inputs: any[] | { [key: string]: any },
        newBuffer = false, //set true if you want bind groups to be updated for the shader automatically
        updateBindGroup?: boolean,
        bindGroupNumber = this.bindGroupNumber
    ) => {

        if (!inputs || Object.keys(inputs).length === 0) return;

        if (newBuffer) { //must be done when updating the shader outside of the buffer() or run() calls
            this.allocateUBO(bindGroupNumber);
            if (updateBindGroup !== false) updateBindGroup = true; //assume true
        }
        if (updateBindGroup) {
            this.updateBindGroup(bindGroupNumber);
        }

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        const inputTypes = this.bufferGroups[this.bindGroupNumber].inputTypes;

        if (bufferGroup.uniformBuffer) { //update custom uniforms
            //console.log(bufferGroup.uniformBuffer)
            // Use a DataView to set values at specific byte offsets
            const dataView = this.getUBODataView(bindGroupNumber);
            //console.log(dataView);
            let offset = 0; // Initialize the offset
            let inpIdx = 0;

            if (!bufferGroup.uniformBufferInputs) {
                bufferGroup.uniformBufferInputs = {};
            }

            bufferGroup.params.forEach((node, i) => {
                if (node.isUniform) {

                    let input;

                    if (Array.isArray(inputs)) input = inputs[inpIdx];
                    else input = inputs?.[node.name];

                    if (typeof input === 'undefined' && typeof bufferGroup.uniformBufferInputs?.[inpIdx] !== 'undefined')
                        input = bufferGroup.uniformBufferInputs[inpIdx]; //saved data

                    const typeInfo = WGSLTypeSizes[inputTypes[inpIdx].type];

                    //console.log(input);

                    bufferGroup.uniformBufferInputs[inpIdx] = input;

                    offset = this.setUBOposition(
                        dataView,
                        typeInfo,
                        offset,
                        input
                    );
                }
                if (node.isInput) inpIdx++;
            });


            //done writing the buffer, unmap it.
            //console.log(inputs, dataView, new Float32Array(dataView.buffer)); //check validity (comment out the unmap or it will be empty)
            if (bufferGroup.uniformBuffer.mapState === 'mapped') bufferGroup.uniformBuffer.unmap();
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

    }

    updateDefaultUBO = (updateBindGroup = false, bindGroupNumber = this.bindGroupNumber) => {

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        if (bufferGroup.defaultUniforms) { //update built-in uniforms (you can add whatever you want to the builtInUniforms list)
            // Use a DataView to set values at specific byte offsets
            const dataView = bufferGroup.defaultUniformBuffer.mapState === 'mapped' ?
                new DataView(bufferGroup.defaultUniformBuffer.getMappedRange()) :
                new DataView(new ArrayBuffer(bufferGroup.defaultUniformBuffer.size)); //little endian
            let offset = 0; // Initialize the offset

            bufferGroup.defaultUniforms.forEach((u, i) => {
                let value = this.builtInUniforms[u]?.callback(this);
                const typeInfo = WGSLTypeSizes[this.builtInUniforms[bufferGroup.defaultUniforms[i]].type];
                offset = this.setUBOposition(dataView, typeInfo, offset, value);
            });

            //done writing the buffer, unmap it.
            if (bufferGroup.defaultUniformBuffer.mapState === 'mapped') bufferGroup.defaultUniformBuffer.unmap();

            // else {
            //     this.device.queue.writeBuffer(
            //         bufferGroup.defaultUniformBuffer,
            //         0,
            //         dataView,
            //         dataView.byteOffset,
            //         bufferGroup.defaultUniformBuffer.size
            //     )
            // }

            if (updateBindGroup) {
                this.updateBindGroup(bindGroupNumber);
            }
        }

    }


    getUBODataView = (bindGroupNumber = this.bindGroupNumber) => {

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        const dataView = bufferGroup.uniformBuffer.mapState === 'mapped' ?
            new DataView(bufferGroup.uniformBuffer.getMappedRange()) :
            new DataView(new ArrayBuffer(bufferGroup.uniformBuffer.size)); //little endian

        return dataView;
    }

    allocateUBO = (bindGroupNumber = this.bindGroupNumber) => {

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        if (!bufferGroup.totalUniformBufferSize) {
            let totalUniformBufferSize = 0;
            bufferGroup.params.forEach((node, j) => {
                if (node.isInput && node.isUniform) {
                    if (bufferGroup.inputTypes[j]) {
                        totalUniformBufferSize += bufferGroup.inputTypes[j].size;
                        if (totalUniformBufferSize % 8 !== 0)
                            totalUniformBufferSize += WGSLTypeSizes[bufferGroup.inputTypes[j].type].alignment;
                    }
                }
            });

            if (totalUniformBufferSize < 8) totalUniformBufferSize += 8 - totalUniformBufferSize;
            else totalUniformBufferSize -= totalUniformBufferSize % 16; //correct final buffer size (IDK)

            bufferGroup.totalUniformBufferSize = totalUniformBufferSize;
        }

        const uniformBuffer = this.device.createBuffer({
            label: 'uniform',
            size: bufferGroup.totalUniformBufferSize ? bufferGroup.totalUniformBufferSize : 8, // This should be the sum of byte sizes of all uniforms
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC,
            mappedAtCreation: true
        });

        bufferGroup.uniformBuffer = uniformBuffer;
        bufferGroup.inputBuffers.uniform = uniformBuffer;

        return true;

    }

    updateVBO = (
        vertices:any,
        index = 0,
        bufferOffset = 0,
        dataOffset = 0,
        bindGroupNumber = this.bindGroupNumber,
        indexBuffer?: boolean,
        indexFormat?: 'uint32' | 'uint16'
    ) => { //update

        let bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }
        if (vertices) {
            if (vertices instanceof GPUBuffer) {
                if (indexBuffer) {
                    if (!bufferGroup.indexCount) bufferGroup.indexCount = 1;
                    bufferGroup.indexBuffer = vertices;
                }
                else {
                    if (!bufferGroup.vertexBuffers) bufferGroup.vertexBuffers = [] as any[];
                    bufferGroup.vertexBuffers[index] = vertices;
                }
            } else {
                if (Array.isArray(vertices)) {
                    // if(!Array.isArray(vertices)) {
                    //     vertices = ShaderHelper.combineVertices(
                    //         typeof vertices.vertex?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.vertex) : vertices.vertex,
                    //         typeof vertices.color?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.color) : vertices.color,
                    //         typeof vertices.uv?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.uv) : vertices.uv,
                    //         typeof vertices.normal?.[0] === 'object' ? ShaderHelper.flattenArray(vertices.normal) : vertices.normal,
                    //     );
                    // }
                    // else 
                    vertices = new Float32Array(
                        ShaderHelper.flattenArray(vertices)
                    );
                }

                if (!isTypedArray(vertices)) return;

                if (indexBuffer || bufferGroup.vertexBuffers?.[index]?.size !== vertices.byteLength) {

                    if (indexBuffer) {
                        if (!bufferGroup.indexCount) bufferGroup.indexCount = vertices.length;
                    }
                    else {
                        if (!bufferGroup.vertexBuffers) bufferGroup.vertexBuffers = [] as any[];
                        if (!bufferGroup.vertexCount) bufferGroup.vertexCount = vertices.length ? (
                            vertices.length / ((this.vertexBufferOptions[index] as any)?.__COUNT || 4)
                        ) : 1;
                    }

                    if (indexBuffer) {
                        const vertexBuffer = this.device.createBuffer({
                            label: 'indexBuffer',
                            size: vertices.byteLength,
                            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.INDEX,
                            //assume read/write
                        });
                        bufferGroup.indexBuffer = vertexBuffer;
                    }
                    else {
                        const vertexBuffer = this.device.createBuffer({
                            label: 'vbo' + index,
                            size: vertices.byteLength,
                            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
                            //assume read/write
                        });
                        bufferGroup.vertexBuffers[index] = vertexBuffer;
                    }
                }

                let buffer;
                if (indexBuffer) {
                    buffer = bufferGroup.indexBuffer; // Copy the vertex data over to the GPUBuffer using the writeBuffer() utility function
                }
                else {
                    buffer = bufferGroup.vertexBuffers[index];
                }
                this.device.queue.writeBuffer(
                    buffer,
                    bufferOffset,
                    vertices,
                    dataOffset,
                    vertices.length
                );
            }
        }
    }
    
    createRenderPipelineDescriptor = (
        vertexBufferOptions: {
            stepMode?: 'vertex' | 'instance',
            [key: string]: string
        }[] = [{
            color: 'vec4<f32>'
        }],
        swapChainFormat = navigator.gpu.getPreferredCanvasFormat(),
        renderPipelineDescriptor: Partial<GPURenderPipelineDescriptor> = {},
        shaderType: 'fragment' | 'vertex' = 'fragment'
    ) => {

        //remember to just use your own render pipeline descriptor to avoid the assumptions we make;
        const vertexBuffers = [];
        let loc = 0;

        this.vertexBufferOptions = vertexBufferOptions;


        vertexBufferOptions.forEach((opt, i) => {
            let arrayStride = 0;
            const attributes = [];

            let ct = 0;
            for (const key in opt) {
                if (key === 'stepMode' || key === '__COUNT') continue;

                const typeInfo = WGSLTypeSizes[opt[key]];
                const format = Object.keys(typeInfo.vertexFormats).find((f) => {
                    if (f.startsWith('float32')) return true;
                }) || Object.values(typeInfo.vertexFormats)[0]
                ct += typeInfo.ct;

                attributes.push({
                    format,
                    offset: arrayStride,
                    shaderLocation: loc
                })

                arrayStride += typeInfo.size;
                loc++;
            }

            (vertexBufferOptions as any)[i].__COUNT = ct; //for setting vertexCount automatically using our assumptions

            const vtxState = {
                arrayStride,
                attributes
            } as any;

            if (opt.stepMode)
                vtxState.stepMode = opt.stepMode;

            vertexBuffers.push(vtxState);

        });

        // 5: Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
        // const vertexBuffers = Array.from({length:vertexBufferOptions.length}, (_,i) => {
        //     return {
        //         arrayStride: 52,
        //         attributes: [
        //             {format: "float32x4", offset: 0,  shaderLocation:  4*i},   //vertex vec4
        //             {format: "float32x4", offset: 16, shaderLocation:  4*i+1}, //color vec4
        //             {format: "float32x2", offset: 32, shaderLocation:  4*i+2}, //uv vec2
        //             {format: "float32x3", offset: 40, shaderLocation:  4*i+3}  //normal vec3
        //         ]
        //     }
        // });

        let desc = { //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
            label: 'renderPipeline',
            layout: this.pipelineLayout ? this.pipelineLayout : 'auto',
            vertex: shaderType === 'fragment' ? { //if using only the vertex buffer use a different descriptor
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
            fragment: shaderType === 'fragment' ? {
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
        if (!this.vertex) delete renderPipelineDescriptor.fragment;
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

        if (this.depthTexture) this.depthTexture.destroy();
        this.depthTexture = depthTexture;

        return { //some assumptions. todo: unassume
            colorAttachments: [{
                view: undefined,//view,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                loadOp: "clear",
                storeOp: "store" //discard
            }],
            depthStencilAttachment: {
                view: undefined,
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
        vertexBufferOptions: { [key: string]: string }[] = [{
            color: 'vec4<f32>'
        }],
        contextSettings?: GPUCanvasConfiguration,
        renderPipelineDescriptor?: Partial<GPURenderPipelineDescriptor>,
        renderPassDescriptor?: GPURenderPassDescriptor,
        shaderType: 'fragment' | 'vertex' = 'fragment'
    ) => {
        // Setup render outputs
        const swapChainFormat = navigator.gpu.getPreferredCanvasFormat();

        (this.context as GPUCanvasContext)?.configure(contextSettings ? contextSettings : {
            device: this.device,
            format: swapChainFormat,
            //usage: GPUTextureUsage.RENDER_ATTACHMENT,
            alphaMode: 'premultiplied'
        });

        renderPipelineDescriptor = this.createRenderPipelineDescriptor(
            vertexBufferOptions, swapChainFormat, renderPipelineDescriptor, shaderType
        );

        if (!renderPassDescriptor)
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

    makeBufferGroup = (bindGroupNumber = this.bindGroupNumber) => {
        const bufferGroup = {} as any;

        bufferGroup.params = this.params; //can get params from other shaders we transpiled
        bufferGroup.returnedVars = this.returnedVars;
        bufferGroup.defaultUniforms = this.defaultUniforms;
        bufferGroup.inputBuffers = {};
        bufferGroup.outputBuffers = {};
        bufferGroup.textures = {};
        bufferGroup.samplers = {};
        bufferGroup.uniformBuffer = undefined;
        bufferGroup.bindGroupLayoutEntries = this.bindGroupLayoutEntries;

        this.bufferGroups[bindGroupNumber] = bufferGroup; //we aren't doing anything with these yet

        if (!this.bufferGroup) this.bufferGroup = bufferGroup;

        return bufferGroup;
    }

    firstRun = true;

    // Main buffer entry point, unchanged logic but split into subfunctions
    buffer = (
        {
            vbos,
            textures,
            indexBuffer,
            indexFormat,
            skipOutputDef,
            bindGroupNumber,
            outputVBOs,
            outputTextures,
            newBindings,
        } = {} as Partial<RenderPassSettings & ComputePassSettings>,
        ...inputs: any[]
    ) => {
        // 1. Ensure bindGroupNumber is set
        bindGroupNumber = this._ensureBindGroupNumber(bindGroupNumber);

        // 2. Get or create bufferGroup
        const bufferGroup = this._getOrCreateBufferGroup(bindGroupNumber);

        // 3. Handle vertex buffer objects and index buffer
        this._updateVbos(bufferGroup, vbos, bindGroupNumber);
        this._updateIndex(bufferGroup, indexBuffer, indexFormat, bindGroupNumber);

        // 4. Initialize inputTypes if needed
        this._initInputTypes(bufferGroup);

        // 5. Determine if we need a new bind group buffer
        let newBindGroup = this._computeNewBindGroupFlag(
            bufferGroup,
            inputs,
            newBindings,
            bindGroupNumber,
            textures
        );

        // 6. Handle textures
        this._updateTexturesCallback(textures, bindGroupNumber, () => {
            newBindGroup = true;
        });

        // 7. Prepare bind group layout entries if rebuilding current group
        this._prepareBindGroupLayout(bufferGroup, bindGroupNumber, newBindGroup);

        // 8. Process shader parameters (uniforms, inputs, outputs)
        const paramContext = {
            bufferGroup,
            settings: { skipOutputDef, bindGroupNumber },
            inputs,
            flags: {
                hasUniformBuffer: 0,
                uBufferPushed: false,
                uBufferSet: false,
            },
            bindGroupAlts: [] as any[],
            uniformValues: [] as any[],
            newBindGroup,
        };
        this._processParams(paramContext);

        // 9. Handle readback of modified VBOs and textures
        this._collectOutputs(bufferGroup, outputVBOs, outputTextures);

        // 10. Recursively call buffer for alternate bind groups
        this._recursiveAltBindings(
            bufferGroup,
            bindGroupNumber,
            inputs,
            paramContext.bindGroupAlts
        );

        // 11. Handle default uniforms buffer
        this._manageDefaultUniforms(bufferGroup);

        // 12. Final UBO and bind group updates
        this._finalizeBindings(
            bufferGroup,
            paramContext.uniformValues,
            bindGroupNumber,
            paramContext.newBindGroup
        );

        return paramContext.newBindGroup;
    };

    // --- Helper implementations follow ---
    private _ensureBindGroupNumber(bindGroupNumber?: number) {
        return bindGroupNumber ?? this.bindGroupNumber;
    }

    private _getOrCreateBufferGroup(bindGroupNumber: number) {
        let group = this.bufferGroups[bindGroupNumber];
        if (!group) {
            group = this.makeBufferGroup(bindGroupNumber);
        }
        return group;
    }

    private _updateVbos(group: any, vbos: any, bindGroupNumber: number) {
        if (!vbos) return;
        if(Array.isArray(vbos))
            vbos.forEach((vertices: any, i: number) => {
                this.updateVBO(vertices, i, undefined, undefined, bindGroupNumber);
            });
        else {
            Object.keys(vbos).forEach(vbo_i => {
                this.updateVBO(vbos[vbo_i].vertices, parseInt(vbo_i), undefined, undefined, bindGroupNumber);
            });
        }
    }

    private _updateIndex(
        group: any,
        indexBuffer: any,
        indexFormat: any,
        bindGroupNumber: number
    ) {
        if (!indexBuffer) return;
        this.updateVBO(indexBuffer, 0, undefined, undefined, bindGroupNumber, true, indexFormat);
    }

    private _initInputTypes(group: any) {
        if (!group.inputTypes && group.params) {
            group.inputTypes = group.params.map((p: any) => {
                let type = p.type;
                if (type.startsWith("array")) {
                    type = type.slice(6, -1);
                }
                return WGSLTypeSizes[type];
            });
        }
    }

    private _computeNewBindGroupFlag(
        group: any,
        inputs: any[],
        newBindings?: boolean,
        bindGroupNumber?: number,
        textures?: any
    ) {
        let flag = newBindings;
        if (inputs.length > 0) flag = true;
        else if (!group.bindGroup) flag = true;
        if (textures) flag = true;
        return flag;
    }

    private _updateTexturesCallback(
        textures: any,
        bindGroupNumber: number,
        markNew: () => void
    ) {
        if (!textures) return;
        this.updateTextures(textures, false, bindGroupNumber);
        markNew();
    }

    private _prepareBindGroupLayout(
        group: any,
        bindGroupNumber: number,
        newBindGroup: boolean
    ) {
        if (newBindGroup && bindGroupNumber === this.bindGroupNumber) {
            group.bindGroupLayoutEntries = this.bindGroupLayoutEntries;
        }
    }

    private _processParams(context: any) {
        const { bufferGroup, settings, inputs, flags } = context;
        const { skipOutputDef, bindGroupNumber } = settings;
        const params = bufferGroup.params || [];

        let inpBuf_i = 0;
        let inpIdx = 0;

        for (let i = 0; i < params.length; i++) {
            const node = params[i];
            const alt = this.altBindings?.[node.name];
            // Alt binding logic
            if (
                inputs[inpBuf_i] !== undefined &&
                alt &&
                parseInt(alt.group) !== bindGroupNumber
            ) {
                context.bindGroupAlts[alt.group] = context.bindGroupAlts[alt.group] || [];
                context.bindGroupAlts[alt.group][alt.group] = inputs[i];
            } else {
                if (node.isUniform && inputs[inpBuf_i] !== undefined) {
                    context.uniformValues[inpIdx] = inputs[inpIdx];
                    if (!bufferGroup.uniformBuffer || !flags.uBufferSet) {
                        flags.uBufferSet = this.allocateUBO(bindGroupNumber);
                    }
                    if (!flags.hasUniformBuffer) {
                        flags.hasUniformBuffer = 1;
                        inpBuf_i++;
                    }
                    inpIdx++;
                } else {
                    // Data buffer logic
                    this._updateDataBuffer(
                        bufferGroup.inputBuffers,
                        node,
                        inputs,
                        inpBuf_i,
                        bindGroupNumber
                    );
                    inpBuf_i++;
                    inpIdx++;
                }
                // Output definition
                if (
                    !skipOutputDef &&
                    node.isReturned &&
                    (!node.isUniform || (node.isUniform && !flags.uBufferPushed))
                ) {
                    if (!node.isUniform) {
                        bufferGroup.outputBuffers[node.name] = bufferGroup.inputBuffers[node.name];
                    } else if (!flags.uBufferPushed) {
                        flags.uBufferPushed = true;
                        bufferGroup.outputBuffers['uniform'] = bufferGroup.uniformBuffer;
                    }
                }
            }
        }
    }

    private _updateDataBuffer(
        inputBuffers: any,
        node: any,
        inputs: any[],
        inpBuf_i: number,
        bindGroupNumber: number
    ) {
        const data = inputs[inpBuf_i];
        if (data !== undefined || !inputBuffers[node.name]) {
            let src = data;
            if (!src?.byteLength && Array.isArray(src?.[0])) {
                src = ShaderHelper.flattenArray(src);
            }
            const existing = inputBuffers[node.name];
            if (existing instanceof GPUBuffer && src.length === existing.size / 4) {
                const buf = new Float32Array(src);
                this.device.queue.writeBuffer(existing, 0, buf, buf.byteOffset, buf.length || 8);
                existing.unmap();
            } else {
                inputBuffers[node.name] =
                    src instanceof GPUBuffer
                        ? src
                        : this.device.createBuffer({
                            label: node.name,
                            size: src
                                ? src.byteLength || src.length * 4
                                : 8,
                            usage:
                                (node.isReturned || node.isModified)
                                    ?
                                    GPUBufferUsage.STORAGE |
                                    GPUBufferUsage.COPY_SRC |
                                    GPUBufferUsage.COPY_DST |
                                    GPUBufferUsage.VERTEX
                                    :
                                    GPUBufferUsage.STORAGE |
                                    GPUBufferUsage.COPY_DST |
                                    GPUBufferUsage.VERTEX,
                            mappedAtCreation: true,
                        });
                new Float32Array(
                    inputBuffers[node.name].getMappedRange()
                ).set(src || new Float32Array(1));
                inputBuffers[node.name].unmap();
            }
        }
    }

    private _collectOutputs(
        bufferGroup: any,
        outputVBOs: any,
        outputTextures: any
    ) {
        if (bufferGroup.vertexBuffers && outputVBOs) {
            Object.values(bufferGroup.vertexBuffers).forEach((vbo: any) => {
                bufferGroup.outputBuffers[vbo.label] = vbo;
            });
        }
        if (bufferGroup.textures && outputTextures) {
            Object.values(bufferGroup.textures).forEach((tex: any) => {
                bufferGroup.outputBuffers[tex.label] = tex;
            });
        }
    }

    private _recursiveAltBindings(
        bufferGroup: any,
        bindGroupNumber: number,
        inputs: any[],
        bindGroupAlts: any[]
    ) {
        bindGroupAlts.forEach((inp, i) => {
            if (inp && i !== bindGroupNumber) {
                this.buffer({ bindGroupNumber: i }, ...inp);
            }
        });
    }

    private _manageDefaultUniforms(bufferGroup: any) {
        if (!bufferGroup.defaultUniforms) return;
        if (!bufferGroup.totalDefaultUniformBufferSize) {
            let totalSize = 0;
            bufferGroup.defaultUniforms.forEach((u: string) => {
                totalSize += WGSLTypeSizes[this.builtInUniforms[u].type].size;
            });
            totalSize = Math.max(8, totalSize + ((16 - (totalSize % 16)) % 16));
            bufferGroup.totalDefaultUniformBufferSize = totalSize;
        }
        bufferGroup.defaultUniformBuffer = this.device.createBuffer({
            label: 'defaultUniforms',
            size: bufferGroup.totalDefaultUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC,
            mappedAtCreation: true,
        });
        bufferGroup.defaultUniformBinding = Object.keys(
            bufferGroup.inputBuffers
        ).length;
    }

    private _finalizeBindings(
        bufferGroup: any,
        uniformValues: any[],
        bindGroupNumber: number,
        newBindGroup: boolean
    ) {
        if (uniformValues.length) {
            this.updateUBO(uniformValues, false, false, bindGroupNumber);
        }
        this.updateDefaultUBO(false, bindGroupNumber);
        if (this.bindGroupLayouts[bindGroupNumber] && newBindGroup) {
            this.updateBindGroup(bindGroupNumber);
        }
    }

    updateBindGroup = (bindGroupNumber = this.bindGroupNumber, customBindGroupEntries?: GPUBindGroupEntry[]) => {

        let bufferGroup = this.bufferGroups[bindGroupNumber];

        if (!bufferGroup) {
            bufferGroup = this.makeBufferGroup(bindGroupNumber);
        }

        const inputBuffers = bufferGroup.inputBuffers;


        if (customBindGroupEntries || this.bindGroupLayouts?.[bindGroupNumber]) {
            // Update bind group creation to include input buffer resources
            let bindGroupEntries = [];
            //console.log(bufferGroup.bindGroupLayoutEntries);
            if (bufferGroup.bindGroupLayoutEntries) {
                bindGroupEntries.push(...bufferGroup.bindGroupLayoutEntries);
                let inpBufi = 0;

                bufferGroup.bindGroupLayoutEntries.forEach((entry, i) => {
                    let type = entry.buffer?.type;
                    const key = entry.name || i;
                    if (type) {
                        if (type.includes('storage') && inputBuffers[key] && inputBuffers[key].label !== 'uniform') {
                            entry.resource = { buffer: inputBuffers[key] }
                            inpBufi++;
                        }
                        else if (type.includes('uniform') && (bufferGroup.uniformBuffer)) {
                            entry.resource = { buffer: bufferGroup.uniformBuffer }
                            inpBufi++;
                        }
                    }
                    //console.log(entry);
                });
                if (bufferGroup.defaultUniformBuffer) bindGroupEntries[bindGroupEntries.length - 1].resource = {
                    buffer: bufferGroup.defaultUniformBuffer
                };
            } else if (inputBuffers) {
                bindGroupEntries.push(...Object.values(inputBuffers).map((buffer: GPUBuffer, index) => ({
                    binding: index,
                    resource: { buffer }
                })));
                if (bufferGroup.defaultUniformBuffer)
                    bindGroupEntries.push({
                        binding: bufferGroup.defaultUniformBinding,
                        resource: { buffer: bufferGroup.defaultUniformBuffer }
                    });
            }

            if (customBindGroupEntries) {
                customBindGroupEntries.forEach((entry, i) => {
                    if (entry) {
                        bindGroupEntries[i] = entry; //overwrite
                    }
                })
            }


            const bindGroup = this.device.createBindGroup({
                label: `group_${bindGroupNumber}`,
                layout: this.bindGroupLayouts[bindGroupNumber],
                entries: bindGroupEntries
            });

            bufferGroup.bindGroup = bindGroup;
            this.bindGroups[bindGroupNumber] = bindGroup;

        }
    }

    getOutputData = (
        commandEncoder: GPUCommandEncoder,
        outputBuffers?: { [key: string]: any },
        returnBuffers?: boolean
    ): Promise<(Float32Array | Uint8Array) | { [key: string]: Float32Array | Uint8Array }> | { [key: string]: GPUBuffer } | GPUBuffer => {
        //Return one or multiple results
        if (!outputBuffers) outputBuffers = this.bufferGroups[this.bindGroupNumber].outputBuffers;

        const keys = Object.keys(outputBuffers);
        const values = Object.values(outputBuffers) as any[];

        // Create staging buffers for all output buffers
        const stagingBuffers = values.map(outputBuffer => {
            return this.device.createBuffer({
                size: outputBuffer.size,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
            });
        });

        // Copy data from each output buffer to its corresponding staging buffer
        values.forEach((outputBuffer, index) => {
            if (outputBuffer.width) {
                commandEncoder.copyTextureToBuffer( //easier to copy the texture to an array and reuse it that way
                    outputBuffer,
                    stagingBuffers[index] as any,
                    [outputBuffer.width, outputBuffer.height, outputBuffer.depthOrArrayLayers]
                );
            } else commandEncoder.copyBufferToBuffer(
                outputBuffer, 0,
                stagingBuffers[index], 0,
                outputBuffer.size
            );
        });

        this.device.queue.submit([commandEncoder.finish()]);

        if (returnBuffers) {
            let output = {};

            if (stagingBuffers.length === 1) return stagingBuffers[0];

            stagingBuffers.map((b, i) => {
                output[keys[i]] = b;
            });

            return output;
        }

        const promises = stagingBuffers.map((buffer, i) => {
            return new Promise((resolve) => {
                buffer.mapAsync(GPUMapMode.READ).then(() => {
                    const mappedRange = buffer.getMappedRange();
                    const rawResults = values[i].format?.includes('8') ? new Uint8Array(mappedRange) : new Float32Array(mappedRange);
                    const copiedResults = values[i].format?.includes('8') ? new Uint8Array(rawResults.length) : new Float32Array(rawResults.length);

                    copiedResults.set(rawResults); // Fast copy
                    buffer.unmap();
                    resolve(copiedResults);
                });
            });
        });

        return new Promise((res) => {
            Promise.all(promises).then((results: (Uint8Array | Float32Array)[]) => {

                if (results.length === 1) res(results[0]);

                const output = {};

                results.map((result, i) => {
                    output[keys[i]] = result;
                });

                res(output);
            });
        }) as Promise<Float32Array | Uint8Array | { [key: string]: Float32Array | Uint8Array }>;

    }

    //bound to the shader scope. Todo: make this more robust for passing values for specific vertexbuffers or say texturebuffers etc
    run = (
        {
            vertexCount,
            instanceCount,
            firstVertex,
            firstInstance,
            vbos,
            outputVBOs,
            textures,
            outputTextures,
            bufferOnly,
            skipOutputDef,
            returnBuffers,
            bindGroupNumber,
            viewport,
            scissorRect,
            blendConstant,
            indexBuffer,
            indexFormat,
            firstIndex,
            useRenderBundle,
            workgroupsX,
            workgroupsY,
            workgroupsZ,
            newBindings
        }: RenderPassSettings & ComputePassSettings & { returnBuffers?: boolean } = {} as any,
        ...inputs:any[]
    ) => {
        // Default bind group
        if (!bindGroupNumber) bindGroupNumber = this.bindGroupNumber;

        // Prepare input buffers
        const newInputBuffer = this._allocateInputs(
            { vbos, textures, indexBuffer, indexFormat, skipOutputDef, bindGroupNumber, outputVBOs, outputTextures, newBindings },
            ...inputs
        );

        if (bufferOnly) return;

        const bufferGroup = this._ensureBufferGroup(bindGroupNumber);
        const commandEncoder = this.device.createCommandEncoder();

        // Compute pass
        if (this.computePipeline) {
            this._executeCompute(commandEncoder, bindGroupNumber, workgroupsX, workgroupsY, workgroupsZ);
        }

        // Graphics pass
        if (this.graphicsPipeline) {
            this._executeGraphics(
                commandEncoder,
                bufferGroup,
                { vertexCount, instanceCount, firstVertex, firstInstance, indexFormat, firstIndex },
                { viewport, scissorRect, blendConstant, useRenderBundle, newInputBuffer }
            );
        }

        // Finish and output
        return this._finalize(commandEncoder, bufferGroup, skipOutputDef, returnBuffers);
    };

    // Private helpers

    _allocateInputs(
        settings:any,
        ...inputs:any[]
    ) {
        return (
            inputs.length > 0 || settings.vbos || settings.textures || settings.indexBuffer
        ) && this.buffer(settings, ...inputs);
    }

    _ensureBufferGroup(bindGroupNumber) {
        let group = this.bufferGroups[bindGroupNumber];
        if (!group) {
            group = this.makeBufferGroup(bindGroupNumber);
        }
        return group;
    }

    _executeCompute(commandEncoder, bindGroupNumber, wX, wY, wZ) {
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.computePipeline);
        this.bindGroups.forEach((group, i) => {
            if (group && (i === bindGroupNumber || this.altBindings)) pass.setBindGroup(i, group);
        });

        const firstBuf = Object.values(this.bufferGroups[bindGroupNumber].inputBuffers)[0] as GPUBuffer;
        const dispatchX = wX
            ?? (firstBuf ? firstBuf.size / 4 / this.workGroupSize : 1);
        pass.dispatchWorkgroups(dispatchX, wY, wZ);
        pass.end();
    }

    _executeGraphics(
        commandEncoder,
        bufferGroup,
        drawParams,
        renderOptions
    ) {
        const {
            vertexCount,
            instanceCount,
            firstVertex,
            firstInstance,
            indexFormat,
            firstIndex
        } = drawParams;
        const {
            viewport,
            scissorRect,
            blendConstant,
            useRenderBundle,
            newInputBuffer
        } = renderOptions;

        // Update count
        bufferGroup.vertexCount = vertexCount ?? bufferGroup.vertexCount ?? 1;

        // Setup render or bundle encoder
        let pass;
        if (useRenderBundle && (newInputBuffer || !bufferGroup.renderBundle)) {
            this._prepareRenderTargets();
            pass = this.device.createRenderBundleEncoder({
                colorFormats: [navigator.gpu.getPreferredCanvasFormat()]
            });
            bufferGroup.firstPass = true;
        } else {
            this._prepareRenderTargets();
            pass = commandEncoder.beginRenderPass(this.renderPassDescriptor);
        }

        // Bind pipeline and groups
        pass.setPipeline(this.graphicsPipeline);
        this.bindGroups.forEach((group, i) => {
            if (group && (i === this.bindGroupNumber || this.altBindings)) {
                pass.setBindGroup(i, group);
            }
        });

        // Ensure vertex buffer
        if (!bufferGroup.vertexBuffers?.length) {
            this.updateVBO(new Float32Array(bufferGroup.vertexCount * 4), 0);
        }
        bufferGroup.vertexBuffers?.forEach((vbo, i) => pass.setVertexBuffer(i, vbo));

        // Set dynamic states
        if (!useRenderBundle) {
            if (viewport) pass.setViewport(...Object.values(viewport));
            if (scissorRect) pass.setScissorRect(...Object.values(scissorRect));
            if (blendConstant) pass.setBlendConstant(blendConstant);
        }

        // Draw call
        if (bufferGroup.indexBuffer) {
            pass.setIndexBuffer(bufferGroup.indexBuffer, indexFormat ?? bufferGroup.indexFormat);
            pass.drawIndexed(bufferGroup.indexCount, instanceCount, firstIndex, 0, firstInstance);
        } else {
            pass.draw(bufferGroup.vertexCount, instanceCount, firstVertex, firstInstance);
        }

        // Finish bundle
        if (useRenderBundle && bufferGroup.firstPass) {
            bufferGroup.renderBundle = (pass as GPURenderBundleEncoder).finish();
            bufferGroup.firstPass = false;
        }

        pass.end();
    }

    _prepareRenderTargets() {
        const canvasTexture = (this.context as GPUCanvasContext).getCurrentTexture();
        this.renderPassDescriptor.colorAttachments[0].view = canvasTexture.createView();
        this.renderPassDescriptor.depthStencilAttachment.view = this.depthTexture.createView();
    }

    _finalize(commandEncoder, bufferGroup, skipOutputDef, returnBuffers) {
        if (!skipOutputDef && bufferGroup.outputBuffers && Object.keys(bufferGroup.outputBuffers).length) {
            return this.getOutputData(commandEncoder, bufferGroup.outputBuffers, returnBuffers);
        }
        this.device.queue.submit([commandEncoder.finish()]);
        return Promise.resolve(true);
    }

}

