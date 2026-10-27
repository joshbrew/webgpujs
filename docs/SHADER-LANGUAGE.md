# Shader names, types and built-ins

[README](../README.md) · [API reference](API.md) · [Coverage and native interop](../WEBGPU-COVERAGE.md)

WebGPUjs shader functions use JavaScript syntax to describe GPU work. Their bodies are parsed into WGSL; they are not called as ordinary JavaScript. Names such as `f32`, `distance` and `threadId` therefore need no JavaScript import. They are meaningful inside a shader passed to WebGPUjs, not in the surrounding host code.

| What you see                                   | Where it comes from                            | Where to look                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `f32(i)`, `vec3f(1, 0, 0)`                     | WGSL type constructors/conversions             | [Types and conversions](#types-and-conversions)                                                                           |
| `distance(a, b)`, `normalize(v)`               | WGSL built-in functions                        | [Function directory](#complete-wgsl-function-directory)                                                                   |
| `threadId`, `vertexIndex`, `position`          | Names WebGPUjs gives WGSL stage inputs/outputs | [Stage inputs](#stage-inputs-and-outputs)                                                                                 |
| `resX`, `mouseX`, `frame`                      | WebGPUjs automatic uniforms                    | [Automatic uniforms](#automatic-uniforms)                                                                                 |
| `device.createBuffer()`, `queue.writeBuffer()` | Host-side WebGPU API                           | [Native WebGPU API](https://gpuweb.github.io/gpuweb/) and [wrapper interop](API.md#workgroups-and-native-gpu-composition) |

The [complete WGSL built-in catalog](https://www.w3.org/TR/WGSL/#builtin-functions) supplies overloads, argument types, result types and stage/feature requirements. This guide explains how to reach those operations through this wrapper. An entry in the WGSL specification is not a promise that every overload or optional extension is supported by the JavaScript frontend; use native WGSL for syntax or interfaces it cannot express.

## Types and conversions

`f32(x)` constructs a 32-bit float from `x`. For example, `threadId.x` is a `u32`; cast it before dividing by a floating-point quantity. This is a shader conversion, not a JavaScript helper. [Official `f32` reference](https://www.w3.org/TR/WGSL/#f32-builtin).

| Shader spelling                                      | Use                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `f32(x)`                                             | Float arithmetic, signal values and coordinates                    |
| `u32(x)`, `i32(x)`                                   | Unsigned/signed integer values and indices                         |
| `bool(x)`                                            | Shader boolean conversion                                          |
| `vec2f(x, y)`, `vec3f(x, y, z)`, `vec4f(r, g, b, a)` | Float vectors                                                      |
| `vec2u(x, y)`, `vec3i(x, y, z)`                      | Integer vectors; the same suffixes work for sizes 2–4              |
| `mat4x4f(...)`                                       | Float matrix; sizes 2×2 through 4×4 are supported                  |
| `f16(x)`, `vec2h(...)`, `mat4x4h(...)`               | Half precision when `shader-f16` is enabled on the supplied device |

Use type strings such as `values = "array<f32>"` for parameters. WebGPUjs normalizes aliases such as `"vec3f"` to `vec3<f32>`. In shader expressions, prefer JS-compatible constructors such as `vec3f(...)`; WGSL template syntax such as `vec3<f32>(...)` is not a JavaScript generic call. Bare `vec2(...)`, `vec3(...)`, `vec4(...)` and matrix constructors without a suffix are emitted with `f32` elements. See [all constructors](https://www.w3.org/TR/WGSL/#constructor-builtin-function).

```js
function radialWeights(values = "array<f32>") {
  const i = threadId.x;
  if (i >= values.length) return;
  const t = f32(i) / f32(max(values.length - 1, 1));
  const point = vec2f(t, 0);
  const d = distance(point, vec2f(0.5, 0));
  values[i] = max(0, 1 - d * 2);
  return values;
}
```

Here `distance(a, b)` returns the length of `a - b`; the example produces a triangular weight curve. The parser rewrites storage-array `.length` into a WGSL array-length expression. [Official `distance` reference](https://www.w3.org/TR/WGSL/#distance-builtin).

## Stage inputs and outputs

These are the exact names supplied by the JavaScript frontend. Do not add them as shader parameters or import them from the package. In native WGSL, declare the corresponding `@builtin(...)` interface yourself; its variable names are your choice.

### Compute

| WebGPUjs name | WGSL input               | Type    | Use                                             |
| ------------- | ------------------------ | ------- | ----------------------------------------------- |
| `threadId`    | `global_invocation_id`   | `vec3u` | Invocation coordinate across the dispatch       |
| `localId`     | `local_invocation_id`    | `vec3u` | Coordinate within one workgroup                 |
| `localIndex`  | `local_invocation_index` | `u32`   | Flat index within one workgroup                 |
| `workgroupId` | `workgroup_id`           | `vec3u` | Workgroup coordinate                            |
| `workgroups`  | `num_workgroups`         | `vec3u` | Dispatched workgroup counts, not workgroup size |

[Compute/workgroup semantics](https://www.w3.org/TR/WGSL/#compute-shader-workgroups) · [Global invocation ID](https://www.w3.org/TR/WGSL/#global-invocation-id-builtin-value) · [All built-in stage values](https://www.w3.org/TR/WGSL/#builtin-inputs-outputs)

`threadId.x` is the usual flat-buffer index for a 1D dispatch. A 2D dispatch needs an explicit flattening rule:

```js
function writeGrid(values = "array<f32>", width = "u32", height = "u32") {
  const x = threadId.x;
  const y = threadId.y;
  if (x >= width || y >= height) return;
  values[y * width + x] = f32(x + y);
  return values;
}

const width = 32,
  height = 24;
const pipeline = await WebGPUjs.createPipeline(writeGrid, {
  workGroupSize: [8, 8],
  computePass: {
    workgroupsX: Math.ceil(width / 8),
    workgroupsY: Math.ceil(height / 8),
  },
});
const grid = await pipeline.process(
  new Float32Array(width * height),
  width,
  height,
);
pipeline.dispose();
```

Workgroup size is configured on the pipeline. Dispatch counts determine how many groups execute. Boundary checks cover the extra invocations when dimensions are rounded up. For cooperative algorithms, every invocation participating in a barrier must reach it consistently; do not put an early return before a barrier for only part of the group. A workgroup barrier does not synchronize different workgroups. Use ordered passes for that boundary. [Uniformity rules](https://www.w3.org/TR/WGSL/#uniformity) · [Reduction demo](../example/demos/reduction/index.js) · [3D workgroups demo](../example/demos/voxel-workgroups/index.js).

### Vertex and fragment

| Name            | Stage                          | Meaning in WebGPUjs                                                                           |
| --------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `vertexIndex`   | Vertex                         | `u32`, from `@builtin(vertex_index)`                                                          |
| `instanceIndex` | Vertex                         | `u32`, from `@builtin(instance_index)`                                                        |
| `position`      | Vertex output                  | Assign the clip-space `vec4f` position                                                        |
| `position`      | Fragment input                 | Read the rasterizer's `vec4f` fragment position; `.xy` are framebuffer coordinates            |
| `is_front`      | Fragment                       | `bool`, from `@builtin(front_facing)`                                                         |
| `sampleIndex`   | Fragment                       | `u32`, from `@builtin(sample_index)`                                                          |
| `sampleMask`    | Fragment input                 | `u32`, from `@builtin(sample_mask)`                                                           |
| `<attribute>In` | Vertex input                   | Attribute declared by the render layout, e.g. `colorIn`                                       |
| `<attribute>`   | Vertex output / fragment input | Matching varying, e.g. assign `color` in the vertex shader and read it in the fragment shader |

These interface names match [the generated signatures](../src/parser.ts). WebGPUjs does not currently generate aliases for every stage built-in in the specification, nor every possible built-in output. For additional interfaces such as subgroup invocation IDs or fragment depth, supply a native WGSL stage with an explicit entry point. See [native descriptors](API.md#factories) and [all WGSL stage inputs/outputs](https://www.w3.org/TR/WGSL/#builtin-inputs-outputs).

## Automatic uniforms

WebGPUjs injects these when a translated shader references them. They are wrapper conveniences, separate from WGSL built-in functions and stage inputs.

| Name               | Type  | Source and units                                                                                                       |
| ------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| `resX`, `resY`     | `f32` | Canvas width/height; fall back to window dimensions when no canvas is supplied                                         |
| `mouseX`, `mouseY` | `f32` | Latest pointer-event `offsetX`/`offsetY`; event coordinates, not automatically scaled to the drawing-buffer resolution |
| `clicked`          | `i32` | Pointer held state, 1 or 0                                                                                             |
| `frame`            | `f32` | Counter starting at zero for that stage context, incremented when its automatic uniforms are updated                   |
| `utcTime`          | `f32` | `Date.now()` in milliseconds, converted to a shader float                                                              |

Automatic mouse input requires an event-capable canvas or window. Resolution inputs require a canvas or browser window. For compute-only code, pass explicit dimensions. For animation, prefer an explicit elapsed-seconds uniform: `utcTime` is a large wall-clock value and loses precision as `f32`. The `frame` counter is not a measurement of elapsed time or screen refresh rate.

```js
function disc(center = "vec2f", radius = "f32") {
  const uv = position.xy / vec2f(resX, resY);
  const d = distance(uv, center);
  const edge = max(fwidth(d), 0.0001);
  const coverage = 1 - smoothstep(radius - edge, radius + edge, d);
  return vec4f(vec3f(0.1, 0.8, 0.6) * coverage, 1);
}
```

Use this as a fragment shader with `center` and `radius` uniforms. `fwidth` is a fragment derivative; it is not a compute-shader operation. The same `position` name has different roles in the vertex and fragment stages. [Derivative reference](https://www.w3.org/TR/WGSL/#derivative-builtin-functions).

## Complete WGSL function directory

Follow a family link for **every function and overload in that family**. The names below are examples for finding the right section, not a separate wrapper whitelist.

| Family / official reference                                                                    | Examples to search for                                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Constructors and conversions](https://www.w3.org/TR/WGSL/#constructor-builtin-function)       | `f32`, `i32`, `u32`, `bool`, vectors, matrices, arrays                                                                     |
| [Bit reinterpretation](https://www.w3.org/TR/WGSL/#bit-reinterp-builtin-functions)             | `bitcast`                                                                                                                  |
| [Logical](https://www.w3.org/TR/WGSL/#logical-builtin-functions)                               | `all`, `any`, `select`                                                                                                     |
| [Arrays](https://www.w3.org/TR/WGSL/#array-builtin-functions)                                  | `arrayLength`                                                                                                              |
| [Numeric, vector and matrix operations](https://www.w3.org/TR/WGSL/#numeric-builtin-functions) | `distance`, `dot`, `cross`, `normalize`, `length`, `mix`, `clamp`, `smoothstep`, `sin`, `pow`, `countOneBits`, `transpose` |
| [Fragment derivatives](https://www.w3.org/TR/WGSL/#derivative-builtin-functions)               | `dpdx`, `dpdy`, `fwidth`, coarse/fine variants                                                                             |
| [Textures](https://www.w3.org/TR/WGSL/#texture-builtin-functions)                              | `textureLoad`, `textureStore`, `textureSample`, `textureSampleLevel`, `textureDimensions`, gathers and comparison sampling |
| [Atomics](https://www.w3.org/TR/WGSL/#atomic-builtin-functions)                                | `atomicLoad`, `atomicAdd`, `atomicCompareExchangeWeak`                                                                     |
| [Packing](https://www.w3.org/TR/WGSL/#pack-builtin-functions)                                  | `pack4x8unorm`, `pack2x16float`                                                                                            |
| [Unpacking](https://www.w3.org/TR/WGSL/#unpack-builtin-functions)                              | `unpack4x8unorm`, `unpack2x16float`                                                                                        |
| [Synchronization](https://www.w3.org/TR/WGSL/#sync-builtin-functions)                          | `workgroupBarrier`, `storageBarrier`, `textureBarrier`, `workgroupUniformLoad`                                             |
| [Subgroups](https://www.w3.org/TR/WGSL/#subgroup-builtin-functions)                            | `subgroupAdd`, `subgroupBallot`, subgroup scans and shuffles                                                               |
| [Quad operations](https://www.w3.org/TR/WGSL/#quad-builtin-functions)                          | `quadBroadcast`, `quadSwapX`, `quadSwapY`                                                                                  |
| [Buffer views](https://www.w3.org/TR/WGSL/#buffer-view-builtin-functions)                      | `bufferView`, `bufferArrayView`, `bufferLength`                                                                            |

Ordinary JS-shaped calls are emitted by name and checked by the GPU's WGSL compiler. Type inference is strongest for the documented scalar/vector and demo paths. Template calls such as `bitcast<f32>(...)`, pointer expressions outside the wrapper's shortcuts, custom result structures and newer extension interfaces can require native WGSL. Subgroups, quad operations, buffer views and newly listed overloads must be checked against the current browser/device and language features; they are reference links, not an assertion of portable frontend coverage. [Coverage boundaries](../WEBGPU-COVERAGE.md#deliberate-boundaries).

For atomics, write `atomicAdd(bins[i], 1)` against `bins = "array<atomic<u32>>"`; WebGPUjs inserts the address-of expression. It also inserts the pointer for `workgroupUniformLoad(scratchValue)`. For a storage array's size, prefer `values.length` instead of spelling a raw pointer-based `arrayLength` call.

`select(falseValue, trueValue, condition)` uses the **second** value when the condition is true. Its arguments are evaluated; it is not a short-circuiting replacement for an unsafe branch. Use `if/else` when one expression must not be evaluated. [Official `select` reference](https://www.w3.org/TR/WGSL/#select-builtin).

## JavaScript Math spellings

The current parser maps these `Math` members to WGSL calls:

```text
abs acos acosh asin asinh atan atan2 atanh ceil cos cosh
exp floor log log2 max min pow round sin sinh sqrt tan tanh trunc
clz32 → countLeadingZeros
```

Numeric constants such as `Math.PI`, `Math.E` and `Math.SQRT2` become numeric literals. Other WGSL functions use their bare names: `distance(a,b)`, `normalize(v)`, `sign(x)`, `clamp(x,0,1)`, `exp2(x)`. Unsupported `Math` members such as `Math.random()` or `Math.hypot()` fail during translation. Use explicit input data for randomness, or WGSL operations such as `length(vec2f(x,y))` for a 2D magnitude. These operations follow shader numeric semantics, rather than every CPU JavaScript edge case.

## Find a working use of a built-in

| Topic                                   | Demo source                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Vector geometry and reflective lighting | [3D water](../example/demos/ocean/shaders.js)                                                                     |
| IDs, casts and 2D/3D dispatch           | [Cooperative voxel reduction](../example/demos/voxel-workgroups/shaders.js)                                       |
| Shared memory and barriers              | [Parallel reduction](../example/demos/reduction/index.js)                                                         |
| Atomics                                 | [Histogram](../example/demos/histogram/shaders.js), [native GPU hash table](../example/demos/gpu-hash/shaders.js) |
| Texture operations                      | [Generate → blur → sample](../example/demos/texture-chain/shaders.js)                                             |
| Fragment derivatives                    | [Signal/curve rendering](../example/demos/correlation/shaders.js)                                                 |
| Half precision                          | [f16 storage and error](../example/demos/half-precision/index.js)                                                 |

The gallery and live editor show the authored JS beside the generated WGSL. Inspect that pair to see the exact resource declarations, built-in parameters and pointer rewrites for a particular shader.
