# Compatibility and release evidence

[API](API.md) · [Release checks](RELEASING.md) · [Run the browser check](http://localhost:8080/verify.html)

The wrapper supports the shader subset and native interop documented in the API reference. WebGPU availability, optional features, formats and limits remain browser/device capabilities. This matrix records actual evidence separately from configured automation.

| Environment                                                                | Evidence                                                                                                                                                      | Result                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Windows, Chromium 156 in the in-app browser, NVIDIA Lovelace               | All 100 demos: setup, live translation, execution, complete shader rebuild, disposal of the first instance, then execution of its replacement                 | 100/100 passed; zero uncaptured GPU errors. [Machine-readable report](verification/windows-chromium.json). |
| Windows, development-only Dawn `webgpu` runtime                            | Numerical algorithms, every demo/editor rebuild, native feature pixels, data visibility and pointer interaction, ownership/disposal, resizing, queued reads, device loss and recovery, plus a mixed-source chain through the fully minified release                  | 241 GPU tests passed locally.                                                                              |
| TypeScript 7, Bundler and NodeNext                                         | Fresh tarball installed outside source modules; strict consumer checking with `skipLibCheck:false`, native DOM WebGPU types, and optional build-plugin import | Both modes passed.                                                                                         |
| Windows, macOS, Linux × Node 22 and 24                                     | Type, unit and packed-package checks in [CI](../.github/workflows/ci.yml)                                                                                     | Configured; remote job results are pending the push. These are package checks, not GPU/browser tests.      |
| Other browser versions, Firefox, Safari and other GPU/backend combinations | Use the same browser verification page and save the report                                                                                                    | Not independently verified in this workspace.                                                              |

The Chromium report requested supported `shader-f16` and `timestamp-query` features. Dawn exercises both enabled-feature paths and the defaults/fallbacks. Occlusion results are visibility signals, and timestamp deltas may be below timer resolution.

## Repeat the browser check

1. Run `npm run example` or `tinybuild` and open `http://localhost:8080/verify.html` in the browser being checked.
2. Leave **Rebuild every shader set** enabled and click **Run checks**.
3. Inspect failed rows and download the JSON report. It records browser, adapter, requested features, shader counts and uncaptured errors.
4. Keep separate reports for each browser/device/backend. A passing native Dawn suite does not substitute for browser media import, presentation or application integration.

This page runs the actual demo modules and source-preservation build. It yields between tests and releases each instance. It does not request microphone/camera access or upload reports.

The 100-demo browser sweep checks compilation, execution, status getters, rebuilds and validation errors. It does not prove that every image is informative. The separate GPU visual tests check visible computed data in the reported algorithm/signal previews, three colored k-means point clouds, changed pixels after input, and pointer movement in the water and tunnel demos. Examples 60–69 additionally exercise every declared data/view/gain control, status access and hover readouts; presentation-only changes preserve the numerical results. Algorithm tests also verify that viewers use the actual chain buffers. Browser controls were exercised directly for all ten, with representative output inspected for examples 38, 40, 43–46 and 48. The package's 42 unit tests cover parsing, linking, layout, scheduling, source preservation and quick clicks between frames.

## Stability contracts exercised

- Cleanup releases only owned allocations and wrapper listeners; supplied devices, textures, buffers and canvas contexts stay usable.
- Shared resources survive their producer while another helper retains them. Batched ping-pong swaps acquire all incoming handles before releasing prior slots.
- Storage/geometry replacement and automatic depth/MSAA resizing release old owned allocations. Frozen vertex-layout objects stay unmodified.
- Chain disposal rejects new work and waits for queued runs/readbacks. Already submitted readbacks can finish after helper disposal.
- Partial compilation/build and readback-copy failures release allocations. Returned native staging buffers are explicitly caller-owned.
- Lost devices produce clear failures; later automatic factories request a replacement device. Applications recreate their existing pipelines.
- Packed exports, parameter-preserving minified shader builds and consumer types are checked from the actual tarball.

Additional devices and browsers should be recorded before claiming a broader compatibility promise. Experimental extensions remain explicit native paths rather than inferred portable features.
