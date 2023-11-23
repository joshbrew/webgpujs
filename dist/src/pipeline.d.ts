/// <reference types="@webgpu/types" />
import { ShaderHelper } from './shader';
import { ShaderOptions, RenderOptions, ComputeOptions, TranspiledShader } from './types';
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
export declare class WebGPUjs {
    static device: GPUDevice;
    static createPipeline: (shaders: Function | {
        code: Function | string;
        transpileString?: boolean;
    } | {
        compute: string | Function;
        vertex: string | Function;
        fragment: string | Function;
        transpileString?: boolean;
    }, options?: ShaderOptions & ComputeOptions & RenderOptions) => Promise<ShaderHelper>;
    static init: (shaders: {
        compute?: TranspiledShader;
        fragment?: TranspiledShader;
        vertex?: TranspiledShader;
    }, options?: ShaderOptions & ComputeOptions & RenderOptions) => ShaderHelper;
    static combineShaders: (shaders: Function | {
        code: Function | string;
        transpileString?: boolean;
    } | {
        compute: string | Function;
        vertex: string | Function;
        fragment: string | Function;
        transpileString?: boolean;
    }, options: ShaderOptions & ComputeOptions & RenderOptions, previousPipeline: ShaderHelper) => Promise<ShaderHelper>;
    static cleanup: (shaderPipeline: any) => void;
}
export default WebGPUjs;
