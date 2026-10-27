# API reference

[← Workflows and screenshots](../README.md) · [WebGPU coverage](../WEBGPU-COVERAGE.md)

The exported interfaces in [types.ts](../src/types.ts) describe the configuration surface. This reference covers factories, execution, resource sharing, shader syntax and native WebGPU controls.

## Factories

| API                                                        | Result and purpose                                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `await WebGPUjs.createPipeline(source, options?)`          | `ShaderHelper`; create compute, render, or compute + render stages.                                                                    |
| `await WebGPUjs.createComputeChain(stages, options?)`      | `ComputeChain`; ordered buffer-based compute passes. A stage is a function, WGSL string, or `{shader, resources?, inputs?, options?}`. |
| `await WebGPUjs.combineShaders(source, options, previous)` | `ShaderHelper`; share allocations with an existing helper. Its compiled layouts and input order remain unchanged.                      |
| `WebGPUjs.init(transpiledStages, options)`                 | Synchronous helper construction from transpiler output.                                                                                |

`createPipeline` accepts a function, a native WGSL string, a `{code, transpileString?, entryPoint?, constants?}` descriptor, or `{compute?, vertex?, fragment?}` with any combination of those stage sources. A lone function defaults to compute; with a canvas it defaults to fragment. A fragment-only pipeline receives a fullscreen vertex shader automatically.

Factories obtain and reuse a device if none is supplied. Pass `{device}` to share your own device. GPU pipeline compilation is asynchronous by default; `{asyncCompilation:false}` selects synchronous compilation. Direct `init()` stays synchronous unless explicitly configured otherwise. A native source descriptor can keep its entry point and specialization defaults with its WGSL; `options.entryPoints` and per-stage `options.constants` override those defaults. Concurrent factories share one automatic device request. After device loss, a subsequent automatic factory requests a new device; existing pipelines must be recreated.

## Resource lifetime

| API                                   | Contract                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline.dispose()`                  | Idempotent; releases this helper's storage/uniform allocations, geometry, generated depth/MSAA targets and automatic pointer listeners.              |
| `await chain.dispose()`               | Stops accepting new work, finishes already queued runs/readbacks, then disposes its pass helpers. `chain.disposed` becomes true when closing starts. |
| `WebGPUjs.dispose(pipelineOrChain)`   | Convenience alias; returns a promise for a chain.                                                                                                    |
| `cleanup()` / `WebGPUjs.cleanup(...)` | Compatibility aliases for disposal. They leave devices and canvas contexts usable.                                                                   |

Caller-provided GPUDevices, buffers, textures, bind groups and canvas contexts are borrowed. The wrapper never destroys a caller-owned device or unconfigures a caller-owned context. Generated allocations have leases: disposing a producer leaves buffers/textures alive while another helper still uses them, including handles passed to an independent helper. Replacing an allocation releases the old lease; the last consumer destroys an owned allocation. A native resource supplied by the application remains application-owned.

`chain.getBuffer(name)` returns the current allocation. Reacquire it after resizing. Native code using the handle must respect its lifetime; native texture views cannot reveal their underlying texture to the wrapper. Keep their owner alive or supply application-owned textures. Submit caller-owned command encoders before replacing or disposing resources referenced by those commands.

`pipeline.disposed` reports helper disposal. Work submitted before disposal can finish, including readbacks; new runs, uploads and reads fail with a disposal error. Device loss produces a specific error. The caller handles application recovery by recreating resources and pipelines on a replacement device.

`getOutputData(encoder, outputs, true)` transfers its staging buffers to the caller. Map/unmap and destroy those returned buffers yourself; normal readbacks release staging allocations automatically, including failures.

```js
const chain = await WebGPUjs.createComputeChain(stages, { device });
try {
  await chain.run(inputs);
  const result = await chain.read("filtered");
  console.log(result);
} finally {
  await chain.dispose(); // The supplied device stays available to other pipelines.
}
// Explicit application shutdown, after all users are finished:
// device.destroy();
```

Automatic `mouseX`, `mouseY` and `clicked` inputs attach event listeners without replacing application handlers. Disposal removes only the wrapper's listeners. Resolution uniforms require a canvas or browser window; compute workloads can declare explicit dimension parameters.

## ComputeChain

| Method/property                                                | Behavior                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `await chain.run(namedInputs?, {readback?, commandEncoder?}?)` | Run all passes. No `readback`: resolves `undefined` after submission or caller-owned encoding. A string: returns that buffer's typed array. An array of names: returns an object keyed by allocation names. |
| `await chain.read(nameOrNames)`                                | Read existing results after prior queued runs. Same return shapes as `readback`.                                                                                                                            |
| `chain.getBuffer(name)`                                        | Return an allocated GPUBuffer without copying.                                                                                                                                                              |
| `chain.passes`                                                 | Underlying ShaderHelpers, in dispatch order; inspect their prototypes or connect a renderer.                                                                                                                |

## ShaderHelper and stage contexts

| API                                                   | Behavior                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `await helper.process(...inputs)`                     | Run its compute stage, with positional inputs and selected shader returns.                   |
| `await helper.render(settings?, ...inputs)`           | Render; inputs combine vertex parameters followed by fragment-only parameters.               |
| `helper.compute`, `.vertex`, `.fragment`              | Lower-level contexts for upload, dispatch and rendering operations.                          |
| `context.buffer(settings, ...inputs)`                 | Upload/allocate resources without dispatching.                                               |
| `await context.run(settings, ...inputs)`              | Run with per-call settings, including `{skipOutputDef:true}` to suppress automatic readback. |
| `context.updateUBO({field:value})`                    | Update selected fields in a packed uniform buffer.                                           |
| `context.updateArrayBuffers({name:data})`             | Update storage arrays by shader name.                                                        |
| `context.updateTexture(textureInfo, shaderName, ...)` | Allocate, upload or replace a texture.                                                       |
| `helper.prototypes`                                   | Original JavaScript and final linked WGSL/resource metadata for every stage.                 |

Use `device.queue.onSubmittedWorkDone()` when you specifically need GPU completion without readback. Submission-only helpers and chains do not wait for that completion. `WebGPUjs.cleanup(helper)` / `helper.cleanup()` alias helper disposal; they leave the device and canvas context usable. Destroy an application-owned device explicitly when all its consumers are finished.

## Common options

| Option                                                                                           | Purpose                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `device`, `canvas`, `context`                                                                    | Supply a GPU device and optional render target.                                                                            |
| `workGroupSize`                                                                                  | Compute shape: number or [x,y,z], default 64. Multidimensional shapes require explicit dispatch counts.                    |
| `computePass`                                                                                    | `workgroupsX/Y/Z`, `skipOutputDef` and upload/dispatch settings. X defaults from the first storage buffer's element count. |
| `renderPass`                                                                                     | Vertex buffers, counts, index buffer/format, instances and texture allocation/upload descriptors.                          |
| `resourceBindings`                                                                               | Per-variable resource names, numeric slots and type/access overrides.                                                      |
| `shaderBindings`                                                                                 | Separate `compute`, `vertex`, `fragment` maps for a multi-stage helper.                                                    |
| `entryPoints`, `constants`                                                                       | Native entry-point names and per-stage WGSL override values.                                                               |
| `bindings`, `samplers`                                                                           | Native layout/resource and sampler descriptor overrides.                                                                   |
| `computePipelineSettings`, `renderPipelineDescriptor`, `renderPassDescriptor`, `contextSettings` | Native WebGPU descriptor controls.                                                                                         |
| `functions`, `variableTypes`, `prependCode`, `workgroupVariables`                                | Helper functions, explicit parameter types and WGSL additions.                                                             |
| `skipCombinedBindings`                                                                           | Disable implicit name sharing; explicit resource identities still work.                                                    |

See [types.ts](../src/types.ts) for the exported option and descriptor types.

For explicit lower-level group updates, the legacy signatures are `updateArrayBuffers(values, updateBindGroup=false, group)` and `updateUBO(values, newBuffer=false, updateBindGroup=false, group)`. The common named-input chain API avoids those positional flags.

## Names and resource routing

For one helper, `.process(...inputs)` follows shader parameter order. `context.run({inputs:{name:value}})` and `helper.render({inputs:{name:value}})` accept named inputs. Choose named inputs or positional arguments for a call. Omitted values retain existing GPU data and uniforms; unknown names fail before dispatch.

Compute `return values`, `return [a,b]` and `return {a,b}` select buffers for automatic readback. One selected output returns a typed array; several return an object keyed by shader name. A bare `return;` exits one invocation. Native WGSL returns do not select host readbacks; use `chain.read()` or `context.getOutputData()` explicitly. `skipOutputDef:true` suppresses automatic readback.

Chains suppress each pass's automatic return readback. `.run()` submits without reading; `.run(inputs,{readback:"output"})` or `.read("output")` copies the selected final allocation. Provide every storage allocation on the first run, including scratch/output arrays. Omitted allocations retain prior GPU contents, including in-place modifications. New typed arrays upload once at first use in a run. Runs and reads on one chain are serialized.

| Where                                    | Names to use                          | Example                                                                    |
| ---------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| `stage.resources` keys                   | That shader's parameter names         | `{samples:"filtered"}` connects `samples` to shared allocation `filtered`. |
| `stage.inputs` keys                      | That shader's uniform parameter names | `{gain:1.5}` fixes this pass's gain, overriding `.run()`.                  |
| `chain.run()`, `.read()`, `.getBuffer()` | Shared names after routing            | `chain.read("filtered")` reads the connected allocation.                   |

Stage `options` supplies per-pass pipeline/dispatch settings. Stage descriptors are copied, rather than modified. Matching compatible storage names share implicitly; resource aliases connect different names. Construction errors identify the pass and valid inputs, and run/read errors list available names.

Ordinary chains encode all passes into one encoder and submit once. Each pass has independent uniform storage. Explicitly sharing a uniform allocation requires ordered submissions to preserve its writes. Chains currently accept storage buffers and numeric uniforms; use `combineShaders()` for textures and mixed compute/render workflows.

Native WGSL bindings are reflected and relocated across chains. Native uniform fields are supplied by name. Direct storage arrays and a struct containing one array work automatically; complex custom structures require explicitly packed native buffers. See the [complete mixed-source workflow](../README.md#3-javascript--native-wgsl).

## Explicit bindings across compute and rendering

`resource` identifies the allocation; `group` and `binding` identify the slot in one shader. They are independent:

```js
const particles = await WebGPUjs.createPipeline(
  { compute: updateParticles, vertex: drawParticles, fragment: shadeParticles },
  {
    canvas,
    shaderBindings: {
      compute: { state: { resource: "particle-state", group: 0, binding: 3 } },
      vertex: { points: { resource: "particle-state", group: 1, binding: 5 } },
    },
    renderPass: {
      vbos: [{ color: "vec4f" }],
      vertexCount: 6,
      instanceCount: 2048,
    },
  },
);
```

The compute variable `state` and vertex variable `points` share a GPUBuffer. Compatible matching names share implicitly. Explicit aliases connect different names. Conflicting types, slot collisions and invalid assignments produce errors. Packed uniforms share only when their complete field order and types match; configure their buffer with the reserved name `uniforms`, and built-in uniforms with `defaults`.

When combining with an existing helper, an explicit `resource` first matches an allocation ID, then a compatible earlier shader variable name. For example, `resourceBindings:{values:{resource:"result"}}` connects a viewer's `values` to a preceding compute shader's `result`, even when the first helper used implicit bindings. Ambiguous names fail with an error; assign a shared resource ID to select the intended allocation. Resources with incompatible types stay independent unless they explicitly claim the same allocation ID, which is an error.

For existing helpers, share the registry and choose when to dispatch:

```js
const first = await WebGPUjs.createPipeline(scaleSamples, {
  computePass: { skipOutputDef: true },
});
await first.process(new Float32Array([1, 2, 3]), 2); // Keep output on GPU.
const second = await WebGPUjs.combineShaders(offsetSamples, {}, first);
const result = await second.process(3); // Read only here: [5,7,9].
```

[`multi-shader.js`](../example/multi-shader.js) demonstrates implicit buffers, explicit stage bindings and texture sharing. [`game-example.js`](../example/game-example.js) combines compute-generated terrain, separate geometry passes, shared depth, per-fragment lighting and an interactive host controller.

## Textures and rendering

A storage view and sampled view can share one GPUTexture through a resource name while using different slots and layouts:

```js
shaderBindings: {
  compute: {
    smoothed: {resource:"blurred-image", type:"texture_storage_2d<rgba8unorm,write>"},
  },
  fragment: {
    displayImage: {resource:"blurred-image", type:"texture_2d<f32>"},
  },
}
```

Run producers before consumers, and use separate textures for a pass that needs to read the previous state while writing a new one. `renderPass.textures` accepts `{width,height,format,isStorage}`, `{source:imageBitmap}`, or `{buffer:typedArray,width,height,...}`. `updateTexture` also accepts an existing GPUTexture. Layout overrides cover cases such as unfilterable floating-point textures, depth textures and comparison samplers.

Examples include [blur/Sobel/bloom](../example/index.html#texture-chain), [RGBA32F reaction diffusion](../example/index.html#reaction), and the [indexed textured cube](../example/index.html#cube). The cube uploads an image, uses a 16-bit index buffer, depth testing and a matrix uniform; its full setup is in [basic-examples.js](../example/basic-examples.js).

## Shader syntax and build tools

### Video and image inputs

Normal `texture_2d<f32>` parameters accept an HTMLVideoElement, VideoFrame, ImageBitmap, HTMLImageElement, ImageData, canvas or OffscreenCanvas directly through named inputs. `{source: media}` also works; intrinsic decoded dimensions are inferred unless a descriptor explicitly supplies dimensions. Wait for video `loadeddata` or image decoding before the first upload. `getMediaDimensions(source)` is exported for sizing compute buffers; it uses video/image/frame dimensions rather than CSS sizes.

```js
// capturePixels is a compute shader with image, pixels, width and height inputs.
const { width, height } = getMediaDimensions(video);
await capture.compute.run({
  inputs: {
    image: video,
    pixels: new Float32Array(width * height * 4),
    width,
    height,
  },
});
// Later decoded frames reuse the allocation; another pass can consume pixels directly.
await capture.compute.run({ inputs: { image: video } });
```

Media is copied into a GPU texture; a compute shader converts it into the storage-buffer representation your algorithm needs. The wrapper does not download frames to turn them into CPU arrays. Existing textures are reused while dimensions/format remain compatible; owned textures are replaced on size changes. Caller-provided GPUTextures remain caller-owned. Cross-origin media needs the source server's permission, and the application owns playback/frame lifetimes.

The complete [video/image → buffers → ASCII demo](../example/demos/video-ascii/index.js) includes capture, Sobel/luminance processing, a glyph atlas, file inputs, fallback input and playback cleanup. [Its shaders](../example/demos/video-ascii/shaders.js) show the GPU buffer handoffs.

### Workgroups and native GPU composition

Declare shared compute memory separately from host inputs:

```js
const reduction = await WebGPUjs.createPipeline(reduceWorkgroup, {
  workGroupSize: 64,
  workgroupVariables: { scratch: "array<f32,64>" },
  computePass: { workgroupsX: 4 },
});
// The JS shader uses scratch[localIndex] and workgroupBarrier().
```

Use `workGroupSize: [8,8]` or `[4,4,4]` for multidimensional JS workgroups, with explicit `computePass.workgroupsX/Y/Z`. Keep barriers in uniform control flow; GPU validation checks WGSL's rules. The [reduction demo](../example/index.html#reduction) uses JS shared memory; [feature tests](../tests/gpu-features.test.js) exercise 2D and 3D local IDs.

For native orchestration, provide an encoder instead of submitting each call:

```js
const commandEncoder = device.createCommandEncoder();
await chain.run(inputs, { commandEncoder }); // No readback here.
await graphics.render({ commandEncoder, inputs: { exposure: 1 } });
// Native copies and query resolves can be encoded here too.
device.queue.submit([commandEncoder.finish()]);
const result = await chain.read("result");
```

Caller-owned encoders are never finished or submitted by the wrapper. Compute helpers with automatic returns need `skipOutputDef:true` in this mode. Independently bind uniforms when encoding several different parameter sets for the same helper; named chains isolate per-pass uniforms automatically. Explicitly shared-uniform chains require ordered submissions and cannot use a caller-owned encoder.

`indirect: {buffer,offset}` selects indirect dispatch/draw; the buffer must have `GPUBufferUsage.INDIRECT`. `dynamicOffsets: {0:[256]}` supplies native dynamic offsets for group zero. Compute `descriptor` accepts native pass settings such as `timestampWrites`; render query sets remain in `renderPassDescriptor`, with `occlusionQueryIndex` selecting the query for a draw. Request optional features on your device and resolve queries through the native encoder.

### Additional rendering and texture controls

`renderPipelineDescriptor: {multisample:{count:4}}` creates matching automatic canvas color/depth targets and a resolve target. Explicit attachment views in `renderPassDescriptor` are preserved for offscreen/depth-only passes. Nested vertex/fragment/depth overrides retain generated defaults. JS fragment shaders can return `{albedo:vec4f(...), normal:vec4f(...)}` to emit locations 0 and 1; supply matching native color targets and attachments. All returns must have the same fields.

`textureViews` supplies per-shader mip/layer/cube view descriptors. Typed texture uploads accept `depthOrArrayLayers`, `rowsPerImage`, `mipLevel`, `origin` and `aspect`; an existing GPUTexture can be supplied with an upload. Native `bindings` own their packing and lifecycle, including explicitly aligned/nested uniform structures and dynamic binding windows. Compact numeric storage vectors/matrices are padded on upload and unpacked on readback; raw ArrayBuffer/GPUBuffer inputs remain available for already packed data.

For video, declare `video="texture_external"` and use `textureSampleBaseClampToEdge`. Pass the video element or VideoFrame each frame with `render({inputs:{video:frame}})`; the wrapper imports it and refreshes its bind group. Application code owns frame closure and source lifetime. [The browser smoke test](http://localhost:8080/external-texture.html) checks import, rendered colors and frame refresh after `npm run build` + `npm run serve`.

### Supported shader language

Supported JavaScript includes synchronous functions/arrows, type-string/numeric defaults, nested helpers, declarations, assignments, arrays with fixed local sizes, indexing, vector swizzles, arithmetic, `if/else`, `for/while`, `break/continue`, strict comparisons, and supported `Math` functions/constants. Atomics accept ordinary references such as `atomicAdd(bins[i],1)`; the compiler emits the WGSL pointer. Call WGSL constructors and built-ins directly: `vec4f`, `mat4x4f`, `select`, `textureLoad`, `textureStore`, etc.

Input arrays, scalar/vector/matrix uniforms and raw shader reflection are supported. Explicitly empty storage uploads are rejected; skip GPU dispatch for empty datasets. Uniform alignment and matrix-column padding are handled by the host writer. Type strings such as `"vec3f"` normalize to WGSL types. Use explicit casts where integer/floating-point semantics matter.

General JavaScript objects/destructuring, general closures, arbitrary library calls, async shader functions, dynamic local array sizes and general JavaScript object semantics are outside this subset. Use `if/else` or WGSL `select` in place of ternary expressions. Uniform booleans should be represented by `u32`/`i32`. Half-float shaders require a device with `shader-f16`; raw f16 readback uses Uint16 bit patterns. Native WGSL can express features the JavaScript compiler does not yet cover.

The published library and demo bundles use full JavaScript minification (identifiers, syntax and whitespace). Consumer apps can also use `minify:true`. Shader source is preserved separately so the parser still receives the authored syntax and binding names; `keepNames` alone does not preserve parameter names.

**Shader parameter names are API data.** A bundler can rename parameters even without identifier minification. Preserve shader modules before bundling, or provide JavaScript as an explicit source descriptor:

```js
const shader = {
  code: `function multiply(values="array<f32>", scale="f32") {
    const i=threadId.x;
    if(i<values.length) values[i]*=scale;
    return values;
  }`,
  transpileString: true,
};
const pipeline = await WebGPUjs.createPipeline(shader);
```

For esbuild projects, the optional build-time subpath preserves exported functions and arrows in `shaders.js` and `*.shaders.js`:

```js
// build.mjs
import { build } from "esbuild";
import { preserveShaderSources } from "webgpujs/esbuild";
await build({
  entryPoints: ["main.js"],
  outfile: "dist/app.js",
  bundle: true,
  format: "esm",
  minify: true,
  plugins: [preserveShaderSources()],
});
```

Import exported shaders normally from those files and pass them to WebGPUjs. The plugin converts them to source descriptors before parameter renaming. Native WGSL strings remain unchanged. Use `{filter:/kernels\.js$/, exports:["transform"]}` to select different modules or mix shader exports with callable host helpers. The special export name `"default"` selects the default shader. This plugin parses JavaScript, not TypeScript; keep shader declarations in JS modules or use explicit source descriptors. It has no runtime esbuild dependency and belongs in the build script, not browser code.

The gallery and GPU test bundles additionally use [shader-sources.mjs](../scripts/shader-sources.mjs) to preserve authored shader functions as source descriptors. Resource aliases still refer to parameter names inside that preserved source. The example build also saves original host function text for display/export, so bundled import aliases and generated source annotations do not appear in the teaching panels. Native WGSL strings are already stable under JavaScript bundling.

Native entry points default to `compute_main`, `vtx_main` and `frag_main`. Set `entryPoints: {compute:"main"}` (or vertex/fragment names) to use existing entry points, and `constants: {compute:{gain:2}}` to specialize native WGSL `override` declarations. Native descriptor overrides remain available. Function and native stages can be mixed in one helper or chain. JavaScript syntax trees are cached (up to 256 sources), and bind groups are reused while resource identities remain unchanged.

## Development and verification

### Compute-focused examples

The [256-channel filter demo](../example/index.html#batch-fft) processes **256 separate signals sampled at 512 Hz**, in 1,024-sample/two-second blocks. It compares original, 60 Hz notch-only, and notch + 3–45 Hz bandpassed signals; the spectrum and channel grid are rendered directly from GPU buffers. A channel change only redraws the display. Filter controls recompute the shared FFT chain without CPU readback. These are rectangular frequency masks on periodic blocks, not a stateful streaming IIR filter; the bandpass already excludes 60 Hz, so the notch-only branch is shown separately.

The [2D FFT demo](../example/index.html#fft-2d) transforms image rows and columns, shows a centered log-magnitude spectrum, filters spatial frequencies, then performs the inverse transform with `1/(width*height)` normalization. The same axis planner handles batched 1D channels and strided image columns. See [fft-examples.js](../example/fft-examples.js) and [fft-shaders.js](../example/fft-shaders.js). Frequency/normalization conventions follow the [NumPy FFT reference](https://numpy.org/doc/stable/reference/routines.fft.html); GPU outputs are checked against analytical signals and direct DFT bins.

The expanded gallery also includes [workgroup reduction](../example/index.html#reduction), [tiled matrix multiplication](../example/index.html#matrix), [stream compaction](../example/index.html#compact), [template correlation](../example/index.html#correlation), [nearest neighbors](../example/index.html#nearest), [run-length encoding](../example/index.html#rle), [summed-area tables](../example/index.html#integral), and [atomic spatial binning](../example/index.html#spatial). Reduction uses JavaScript workgroup memory/barriers; tiled matrix multiplication demonstrates native shared memory and two-dimensional dispatch. The other pipelines use JavaScript array kernels. [algorithm-examples.js](../example/algorithm-examples.js) shows their host wiring and [algorithm-shaders.js](../example/algorithm-shaders.js) their source.

These examples deliberately use small, inspectable datasets and numerical references. They demonstrate GPU algorithm structure rather than claim an optimized production FFT, sort or linear-algebra library. Increase problem size and measure total upload/dispatch/readback cost for your application.

### Coverage

See [the coverage audit](../WEBGPU-COVERAGE.md) for the supported surface, tested native escape hatches and remaining gaps. The JavaScript compiler is a shader-language subset; native WGSL support does not imply that every WebGPU command or host data layout is wrapped.

```sh
npm test             # compiler, linker, layout, exports and animation scheduling
npm run test:gpu     # real GPU compilation, numerical references, pixels and mixed-source chains
npm run typecheck
npm run build        # library, declarations, gallery and editor
npm run benchmark    # cold and cached transpilation timings
```

The GPU suite uses the development-only Dawn `webgpu` runtime and requires an adapter. It tests every gallery setup and editor rebuild, FFT/FIR numerical results, sorting, shared buffer/texture updates, mixed JavaScript/WGSL, deferred readback, long-running cloth and game controls. Tests use the same shader-source preservation plugin as the browser build. Implementation responsibilities are described in [src/notes.md](../src/notes.md); the historical `src/old` directory is excluded from the active build.

## Stable and advanced surfaces

The primary API is the factories, named/positional execution, compute-chain routing/readback/disposal, source descriptors and the option types documented here. Shader input names define connections; GPU bindings and optional features can be explicit.

`WGSLTranspiler` is the standalone compiler API. `ShaderHelper`, `ShaderContext` and `WebGPUjs.init` expose lower-level interoperability. Prefer factory-created helpers for normal use. Allocation records, generated layouts, parser ASTs and methods marked `@internal` are implementation details; use named inputs, native descriptor overrides and `chain.getBuffer()` to compose application code.

`renderPipelineSettings` is a deprecated alias for `renderPipelineDescriptor`. `indexCount` selects a subset of an index buffer, including padded or capacity-sized native buffers. Input positions may explicitly be `undefined` to retain existing values.

[Browser/device verification and recorded coverage](COMPATIBILITY.md)
