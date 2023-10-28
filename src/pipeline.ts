import { WGSLTranspiler } from "./transpiler";
import {ShaderHelper} from './shader'
import {ShaderOptions, RenderOptions, ComputeOptions, RenderPassSettings, ComputePassSettings, TranspiledShader} from './types'

// pipeline, transpiler, shader.

// pipeline handles setup and recycling for webgpu and our shader classes
// transpiler... transpiles
// shader keeps specific data structures and webgpu logic per compute/render pipeline

/**
 * 
## WebGPU Pipeline Setup (Generalized for Compute and Rendering)

### 1. Initialization:

#### - Device Setup:
   * If a device is not provided, request an adapter and then request a device from that adapter.

#### - Bind Group Layout Creation:
   * Define the layout of resources (like buffers and textures) that will be available to the shader(s).

#### - Pipeline Layout Creation:
   * Create a pipeline layout using the bind group layout(s).

#### - Shader Module Creation:
   * Define shader module(s) containing the shader code that will be executed on the GPU. This could be a compute shader for compute pipelines or vertex/fragment shaders for rendering pipelines.

#### - Pipeline Creation:
   * For a **Compute Pipeline**: Create a compute pipeline using the pipeline layout and the compute shader module.
   * For a **Rendering Pipeline**: Create a render pipeline using the pipeline layout, vertex shader, fragment shader, and other configurations like blending, rasterization, and depth-stencil operations.

### 2. Data Processing or Rendering:

#### - Buffer Management:
   * Check if the required buffers exist and if their sizes match the current input or requirements. If not, create and populate them as needed.

#### - Bind Group Creation:
   * Create bind groups that bind the buffers, textures, or other resources to the bindings defined in the bind group layout.

#### - Command Encoding:
   * Create a command encoder.
   * Begin a pass (compute or render pass).
   * Set the pipeline (compute or render pipeline) and bind group(s).
   * For a **Compute Pipeline**: Dispatch workgroups to execute the compute shader.
   * For a **Rendering Pipeline**: Set vertex and index buffers, draw calls, etc.
   * End the pass.

#### - Data Transfer (if needed):
   * If results need to be read back from the GPU, create staging buffers and copy the results from the GPU buffers to the staging buffers.

#### - Command Submission:
   * Submit the commands to the device's queue for execution.

#### - Result Retrieval (if applicable):
   * Once the GPU finishes processing, map the staging buffer(s) to read the results, copy them to a new array or structure, and return or use them as needed.

 * 
 */

export class WebGPUjs {
    static device:GPUDevice;
    static createPipeline = async (
        shaders: Function | {
                code:Function|string, 
                transpileString?:boolean //functions are auto-transpiled
            } | {
                compute:string|Function,
                vertex:string|Function,
                fragment:string|Function,
                transpileString?:boolean
            },
        options:ShaderOptions & ComputeOptions & RenderOptions = {}
    ):Promise<ShaderHelper> => {


        let device = options.device; //device is required!
        if (!device) {
            device = this.device;
            if(!device) {
                const gpu = navigator.gpu;
                const adapter = await gpu.requestAdapter();
                if(!adapter) throw new Error('No GPU Adapter found!');
                device = await adapter.requestDevice();
                this.device = device;
            }
            options.device = device;
        }

        if(options.canvas) {
            if(!options.context) 
                options.context = options.canvas.getContext('webgpu') as any;
        }

        if(typeof shaders === 'function') {
            const shader = WGSLTranspiler.convertToWebGPU(
                shaders,
                options.canvas ? 'fragment' : 'compute', 
                options.bindGroupNumber, 
                options.nVertexBuffers, 
                options.workGroupSize, 
                options.functions
            );

            if(options.getPrevShaderBindGroups) {
                let combined = WGSLTranspiler.combineBindings(shader.code, options.getPrevShaderBindGroups);
                shader.code = combined.code1;
                (shader as any).altBindings = combined.changes1;
            }

            let shaderPipeline;
            if(shader.type === 'compute') {
                shaderPipeline = new ShaderHelper({compute:shader}, options);
            } else {
                shaderPipeline = new ShaderHelper({fragment:shader}, options);
            }

            if(options.inputs || options.renderPass) {
                if(shaderPipeline['compute']) {
                    shaderPipeline.process(...options.inputs as any[]);
                }
                if(shaderPipeline['fragment']) {
                    let inps = options.inputs? [...options.inputs] : [];
                    shaderPipeline.render({...options.renderPass}, ...inps);
                }
            }
    
            return shaderPipeline;

        } else {
            const block = shaders as any;
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

                const shaderPipeline = this.init(block,options);

                if(options.inputs || options.renderPass) {
                    if(shaderPipeline['compute']) {
                        shaderPipeline.process(...options.inputs as any[]);
                    }
                    if(shaderPipeline['fragment']) {
                        let inps = options.inputs? [...options.inputs] : [];
                        shaderPipeline.render({...options.renderPass}, ...inps);
                    }
                }
                
                return shaderPipeline;
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
                            block.compute ? block.compute.bindGroupNumber + 1 : options.bindGroupNumber, 
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
                            block.compute ? block.compute.bindGroupNumber + 1 : options.bindGroupNumber, 
                            options.nVertexBuffers, 
                            options.workGroupSize, 
                            options.functions
                        );
                    }
                }

                //combine shader bindings where variable names are shared.

                if(options.getPrevShaderBindGroups) {
                    for(const key in block) {
                        let combined = WGSLTranspiler.combineBindings(block[key].code, options.getPrevShaderBindGroups);
                        block[key].code = combined.code1;
                        block[key].altBindings = combined.changes1;
                    }
                }

          
                const shaderPipeline = new ShaderHelper(block,options);

                if(options.inputs || options.renderPass) {
                    let inps = options.inputs? [...options.inputs] : [];
                    if(options.inputs && shaderPipeline['compute']) {
                        shaderPipeline.process(...inps as any[]);
                    }
                    if(shaderPipeline['fragment']) {
                        shaderPipeline.render(options.renderPass, ...inps);
                    }
                }
        
                return shaderPipeline;
                
            }
        }

        
    }

    static init = (
        shaders:{
            compute?:TranspiledShader,
            fragment?:TranspiledShader,
            vertex?:TranspiledShader
        },
        options?:ShaderOptions & ComputeOptions & RenderOptions
    ) => {
        return new ShaderHelper(shaders, options);
    }

    static combineShaders = (
        shaders: Function | {
            code:Function|string, 
            transpileString?:boolean //functions are auto-transpiled
        } | {
            compute:string|Function,
            vertex:string|Function,
            fragment:string|Function,
            transpileString?:boolean
        },
        options:ShaderOptions & ComputeOptions & RenderOptions = {},
        previousPipeline:ShaderHelper
    ):Promise<ShaderHelper> => {

        let bindGroupNumber = previousPipeline.bindGroupLayouts.length;
        if(options.bindGroupLayouts) options.bindGroupLayouts; previousPipeline.bindGroupLayouts.push(...options.bindGroupLayouts);
        options.bindGroupNumber = bindGroupNumber;
        options.bindGroupLayouts = previousPipeline.bindGroupLayouts;
        options.bindGroups = previousPipeline.bindGroups;
        options.bufferGroups = previousPipeline.bufferGroups;
        if(previousPipeline.fragment) {
            options.getPrevShaderBindGroups = previousPipeline.fragment.code;
        } else if(previousPipeline.compute) {
            options.getPrevShaderBindGroups = previousPipeline.compute.code;
        }

        return WebGPUjs.createPipeline(shaders,options); //generate a new helper for the new shaders that combines previous information like layouts and buffers. Variable names can reference the same bindings now inputted in whatever order.
    }

    static cleanup = (shaderPipeline) => {
        if(shaderPipeline.device) shaderPipeline.device.destroy(); //destroys all info associated with pipelines on this device
        if(shaderPipeline.context) shaderPipeline.context.unconfigure();
    }

}

export default WebGPUjs;

