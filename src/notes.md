# Implementation notes

The active system separates syntax, resource linking and execution:

- `parser.ts`: parse JavaScript with Acorn, analyze references, infer input types and emit WGSL from syntax nodes. No source function is evaluated. Cached syntax trees are read-only.
- `bindings.ts`: reflect raw WGSL and resolve resource identities and binding slots once across the shader set. Prior compiled pipelines are immutable.
- `transpiler.ts`: public conversion facade, legacy binding-combination utility, built-in uniform callbacks and type/format reference tables.
- `pipeline.ts`: normalize function / source-string inputs, choose a device, transpile stages and construct a helper.
- `shader.ts`: coordinate stage-specific layouts, uploads and pass submission.
- `lifecycle.ts`: owned/borrowed resource leases, per-helper registry references, atomic batch rebinding and device-loss state.
- `readback.ts`: native copy/map operations, data unpacking and unconditional staging cleanup.
- `vertex-data.ts`: geometry uploads, count/offset validation, index packing and replacement leases.
- `builtin-inputs.ts`: event listeners and browser resolution inputs without changing application handlers.
- `shader-source.ts`: common runtime validation for source descriptors and chain stages.
- `esbuild-plugin.mjs`: optional published build-time preservation of shader function source.
- `compute-chain.ts`: route named inputs across ordered compute passes and defer readback until explicitly requested.

Resource identity is independent of binding location. A compute storage texture and a fragment sampled texture can share one GPUTexture while using different slots and layouts. A chain shares the allocation registry, not mutable arrays of compiled layouts. Vertex and fragment declarations are combined only for their render pipeline.

Remaining extension points include automatic nested host-shareable structures, richer typed helper signatures and additional texture copy formats. These should extend syntax/resource metadata rather than add global string replacements. New coverage should include actual GPU compilation or numeric results when practical. See README.md and tests/ for the supported contract.

The named compute chain adds `compute-chain.ts`: it translates named host inputs to each pass's positional inputs, uploads a shared allocation once per run, suppresses intermediate returns, serializes runs/reads and maps only explicitly requested final buffers. `pipeline.ts` resolves friendly aliases, including aliases that point to earlier implicit parameter names, and relocates native module slots unless the caller supplies them explicitly.

Factory-created GPU pipelines compile asynchronously; direct helper construction retains the synchronous path. Native entry points and specialization constants are stage-specific options. JavaScript syntax caching remains independent of GPU pipeline compilation.

The gallery keeps one shared device, starts or prewarms examples after scrolling settles, pauses based on actual preview visibility, and builds only the selected shader comparison. `scripts/shader-sources.mjs` preserves shader function source before host bundling: source parameter names are part of the binding API, so ordinary bundler renaming must not change them. Browser and GPU-test bundles use the same transformation.

README.md is the public API contract. WEBGPU-COVERAGE.md distinguishes implemented/tested behavior, native escape hatches and unfinished features.

Compute chains now give implicit uniform allocations a per-stage identity and batch dispatches in one encoder. Explicit shared uniform allocations retain ordered submissions. Caller-owned encoders stay unsubmitted, enabling native indirect commands, query resolution and copies to compose with the wrapper. Per-call named inputs are normalized in `ShaderContext.buffer`, alongside the existing positional path.

`workgroups.ts` validates generated workgroup shapes. Shared workgroup variables are declarations in the AST compiler's type environment, not host inputs or storage bindings. Fragment output objects produce an explicit WGSL output struct for MRT. Native uniform reflection splits nested member/type lists structurally; reflected member align/size attributes participate in layout compatibility. Numeric storage packing and readback handle vec3/matrix padding.

Render attachment preparation distinguishes owned canvas attachments from caller-provided views. Canvas multisampling allocates matching color/depth textures and resolves; offscreen views and depth-only passes stay native. Texture uploads cover layers, mips and existing handles; external sources are imported/rebound per call. The browser VideoFrame test is separate from Dawn tests because native Node has no VideoFrame source API.

The example build also attaches original host declaration text as `sourceCode`, including nested update functions. `example/host-source.js` reads this metadata for gallery/editor panels and exports; runtime functions remain ordinary callable functions. Configuration snippets reference shader names and omit presentation metadata and duplicate helper strings. `shader-info.js` provides consistent stage/entry-point labels; `pipeline-overview.js` lets readers navigate the shader set without claiming to infer host dispatch order.
