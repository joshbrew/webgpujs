# Unreleased

- Fully minify the runtime, optional build plugin and demos in both build paths, preserving authored shader and teaching source. Verify a fully minified installed consumer and a GPU chain through the minified release.
- Fix the inspector status getters in examples 60–69, which stopped updates after the first draw. Retain the current hover/view state in the inspector and exercise every declared control against rendered pixels and GPU results. Give variance statistics separate compressed scales so spread changes remain visible.
- Fix explicit aliases targeting implicitly linked variables so compute results reach subsequent render and signal-processing stages. Add rendered-output and buffer-identity regressions.
- Limit graphics resource visibility to stages that declare it, including fragment-only atomic storage.
- Add inspectable algorithm views, editable data and solver controls, draggable clustering and BFS sources, clearer signal plots, and a 3D compute-generated water mesh. Preserve quick clicks between animation frames and add pointer steering to the polar tunnel.
- Add idempotent helper disposal and queued chain disposal. `cleanup()` aliases disposal and no longer destroys the shared GPUDevice or unconfigures its canvas. Explicit application shutdown uses `device.destroy()`.
- Track generated resource ownership across linked helpers and independent borrowers. Safely release replaced allocations and preserve batched ping-pong swaps.
- Separate resource lifetime, geometry uploads, readback, automatic pointer inputs and source validation into internal modules.
- Preserve application event handlers, detach wrapper listeners and handle device-loss failures/default-device renewal.
- Support native source descriptors with `entryPoint` and specialization `constants`, preserving them through editor rebuilds.
- Add explicit `indexCount`, frozen vertex-layout support and reused index uploads. Explicit empty storage uploads now fail with a descriptive error.
- Publish optional `webgpujs/esbuild` source preservation for exported JS shaders, including minified bundles. Keep source descriptors available for other build tools.
- Add a repeatable 100-demo browser verification page, recorded compatibility results, lifecycle regressions and cross-platform package CI.

See [API contracts](docs/API.md), [compatibility evidence](docs/COMPATIBILITY.md) and [release checks](docs/RELEASING.md).
