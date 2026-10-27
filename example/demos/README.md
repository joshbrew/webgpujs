# Demo sources

[Main README](../../README.md) · [Run the gallery](http://localhost:8080/) · [API reference](../../docs/API.md)

Every demo has one folder containing its complete host workflow and the shaders it uses. No gallery code is needed to create its pipelines. The site, live editor and standalone runner all consume the same [registry](index.js).

```text
demos/
  cube/
    index.js       # Metadata, controls, uploads, pipeline setup and frame update
    shaders.js     # This demo's vertex and fragment functions
    geometry.js    # Cube vertex/index data
    knucks.jpg     # Local texture asset
  batch-fft/
    index.js       # Batched FFT planner, allocations, filters and GPU display setup
    shaders.js     # Signal generation, FFT, filtering and display kernels
  video-ascii/
    index.js       # Video/image lifecycle, glyph atlas and three-pass GPU workflow
    shaders.js     # Frame → pixels → luminance/edges → glyph rendering
```

## Run one example

After `npm run example` or `tinybuild`, open `http://localhost:8080/demo.html?example=cube`. Substitute any ID below. The standalone host only initializes that demo. Its sliders are declared in the demo module; media inputs mount their own file/playback controls. The gallery's **Run this demo alone** link opens the same page.

## Reuse the source in an app

```js
import { setup } from "./demos/cloth/index.js";

const canvas = document.querySelector("canvas");
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const demo = await setup(canvas, device);
const controls = { wind: 0.8, pointer: [0.5, 0.5], down: false };
async function animate(time) {
  await demo.frame(time, controls); // Milliseconds; each module handles its shader units.
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
```

In an external app, change the module's WebGPUjs import to `import {WebGPUjs} from "webgpujs"`. Keep its shader file and local assets alongside it. Some geometry demos, including cube, game, ocean and mesh-normals, also import `wgpu-matrix`; install that package for those examples. Interactive modules may import the small shared control helpers; retain those imports or replace them with your app's input handling. The cube's image import uses an esbuild `.jpg: "file"` loader and resolves its emitted URL relative to the built module.

**Preserve shader source before bundling.** The repository uses [shader-sources.mjs](../../scripts/shader-sources.mjs): exported functions in each `shaders.js` become JavaScript source descriptors before the bundler can rename parameters. Host functions retain their authored text for the source views and exports. Reuse that plugin and its folder convention, or use explicit `{code,transpileString:true}` shader descriptors. See the [build contract](../../docs/API.md#supported-shader-language).

## Module contract

| Export/result                                    | Meaning                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Default export                                   | `{id,title,description,setup,controls?,canvasSize?,...}` metadata.                                         |
| `await setup(canvas,device,options?)`            | Allocate this instance's resources and pipelines. Some demos accept dimension overrides through `options`. |
| `demo.frame(milliseconds,controls?)`             | Run this demo's updates and draws. Calls should be awaited, so frames do not overlap.                      |
| `demo.pipelines`                                 | Helpers used by this instance; the editor captures their actual stages.                                    |
| `continuous:false`                               | Redraw on input changes rather than every frame.                                                           |
| Optional `reset`, `readback`, `resultInfo`       | Restart, numerical results and a readable status.                                                          |
| Optional `mountControls`, `setActive`, `dispose` | Media-specific UI, playback pausing and resource cleanup.                                                  |

Use the shared [animation scheduler](../animation-scheduler.js) for long pages: it serializes frame calls, pauses hidden/offscreen previews and freezes their clocks. Each demo owns its GPU passes; site hosts own visibility and presentation. Legacy aggregate filenames remain small compatibility exports for existing links and tests.

Controls use `[key,label,min,max,step,initial,choices?]`. Numeric ranges become sliders; 0/1 switches become checkboxes. An optional array of labels renders a named select menu while passing numeric values to the shader. The gallery, editor and standalone runner use the same control renderer and pointer handling. Pointer coordinates are `[0,1]` for `stateType` simulations and clip coordinates `[-1,1]` otherwise. The editor preserves controls per example and applies them when rebuilding.

## Add a demo

1. Add a folder with `index.js` and `shaders.js`; export `setup` and the default metadata object.
2. Import the default metadata into [the registry](index.js).
3. Add its ID to [a contents group](../gallery-catalog.js).
4. Run `npm test`, `npm run test:gpu` and `npm run build`. Every registered setup is captured and translated by the GPU/editor suite.

## Media input

The video demo defaults to [MDN's CC0 flower clip](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4), a working HTTPS source with cross-origin access. If it cannot load, a generated source keeps the GPU pipeline visible. Local file input accepts both images and videos. The sample, a file, an ImageBitmap, canvas or VideoFrame can feed a normal texture parameter, then a compute shader writes reusable storage buffers. No canvas pixel readback is required. Video playback pauses with the preview.

## Graphics & lighting

Geometry, materials, surface normals and lighting.

| ID             | Setup and update                                          | Shader source                           |
| -------------- | --------------------------------------------------------- | --------------------------------------- |
| `triangle`     | [Triangle](./triangle/index.js)                           | [shaders.js](./triangle/shaders.js)     |
| `cube`         | [Textured cube](./cube/index.js)                          | [shaders.js](./cube/shaders.js)         |
| `video-ascii`  | [Video / image → buffers → ASCII](./video-ascii/index.js) | [shaders.js](./video-ascii/shaders.js)  |
| `torus`        | [Raymarched torus](./torus/index.js)                      | [shaders.js](./torus/shaders.js)        |
| `soft-shadows` | [Spheres and soft shadows](./soft-shadows/index.js)       | [shaders.js](./soft-shadows/shaders.js) |
| `bump`         | [Procedural bump lighting](./bump/index.js)               | [shaders.js](./bump/shaders.js)         |
| `ocean`        | [Water normals](./ocean/index.js)                         | [shaders.js](./ocean/shaders.js)        |

## WebGPU resources & rendering

Multiple render targets, depth and stencil, indirect draws, bundles, texture dimensions, precision and GPU queries.

| ID                  | Setup and update                                                             | Shader source                                |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `deferred-lighting` | [Deferred lighting with a G-buffer](./deferred-lighting/index.js)            | [shaders.js](./deferred-lighting/shaders.js) |
| `stencil-portal`    | [A stencil-masked portal](./stencil-portal/index.js)                         | [shaders.js](./stencil-portal/shaders.js)    |
| `shadow-map`        | [Depth-only shadow map](./shadow-map/index.js)                               | [shaders.js](./shadow-map/shaders.js)        |
| `indirect-culling`  | [GPU culling → indirect instancing](./indirect-culling/index.js)             | [shaders.js](./indirect-culling/shaders.js)  |
| `mesh-normals`      | [Compute-generated mesh and normals](./mesh-normals/index.js)                | [shaders.js](./mesh-normals/shaders.js)      |
| `render-bundles`    | [Reusable render bundles and instances](./render-bundles/index.js)           | [shaders.js](./render-bundles/shaders.js)    |
| `occlusion-query`   | [Occlusion query and scissor](./occlusion-query/index.js)                    | [shaders.js](./occlusion-query/shaders.js)   |
| `timestamp-query`   | [GPU compute timestamp profiling](./timestamp-query/index.js)                | [shaders.js](./timestamp-query/shaders.js)   |
| `half-precision`    | [Half-precision storage and error](./half-precision/index.js)                | [shaders.js](./half-precision/shaders.js)    |
| `mipmaps`           | [Mip levels and explicit LOD](./mipmaps/index.js)                            | [shaders.js](./mipmaps/shaders.js)           |
| `texture-array`     | [Texture-array flipbook](./texture-array/index.js)                           | [shaders.js](./texture-array/shaders.js)     |
| `volume-texture`    | [3D texture volume raymarch](./volume-texture/index.js)                      | [shaders.js](./volume-texture/shaders.js)    |
| `cube-reflection`   | [Cube-map reflection lookup](./cube-reflection/index.js)                     | [shaders.js](./cube-reflection/shaders.js)   |
| `voxel-workgroups`  | [3D workgroups and cooperative voxel reduction](./voxel-workgroups/index.js) | [shaders.js](./voxel-workgroups/shaders.js)  |

## Games & simulations

Control a character, pull cloth, paint a field or simulate many bodies.

| ID          | Setup and update                                     | Shader source                        |
| ----------- | ---------------------------------------------------- | ------------------------------------ |
| `game`      | [Crystal meadow · a playable scene](./game/index.js) | [shaders.js](./game/shaders.js)      |
| `boids`     | [Flocking](./boids/index.js)                         | [shaders.js](./boids/shaders.js)     |
| `particles` | [Explicit particle field](./particles/index.js)      | [shaders.js](./particles/shaders.js) |
| `life`      | [Conway’s Game of Life](./life/index.js)             | [shaders.js](./life/shaders.js)      |
| `waves`     | [2D wave equation](./waves/index.js)                 | [shaders.js](./waves/shaders.js)     |
| `nbody`     | [N-body gravity](./nbody/index.js)                   | [shaders.js](./nbody/shaders.js)     |
| `cloth`     | [Spring cloth](./cloth/index.js)                     | [shaders.js](./cloth/shaders.js)     |
| `reaction`  | [Reaction-diffusion chemistry](./reaction/index.js)  | [shaders.js](./reaction/shaders.js)  |
| `heat`      | [Heat diffusion](./heat/index.js)                    | [shaders.js](./heat/shaders.js)      |
| `cyclic`    | [Cyclic cellular automaton](./cyclic/index.js)       | [shaders.js](./cyclic/shaders.js)    |
| `excitable` | [Excitable medium](./excitable/index.js)             | [shaders.js](./excitable/shaders.js) |
| `coupled`   | [Coupled phase oscillators](./coupled/index.js)      | [shaders.js](./coupled/shaders.js)   |

## Signals & transforms

FFT and 2D transforms, time-frequency analysis, stateful multichannel filtering, coherence and translation estimation.

| ID                  | Setup and update                                                   | Shader source                                |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `dft`               | [Fourier transform](./dft/index.js)                                | [shaders.js](./dft/shaders.js)               |
| `fft`               | [Radix-2 FFT analyzer](./fft/index.js)                             | [shaders.js](./fft/shaders.js)               |
| `spectral`          | [FFT → filter → inverse FFT](./spectral/index.js)                  | [shaders.js](./spectral/shaders.js)          |
| `fir`               | [FIR smoothing → gain](./fir/index.js)                             | [shaders.js](./fir/shaders.js)               |
| `batch-fft`         | [256 channels · notch + bandpass](./batch-fft/index.js)            | [shaders.js](./batch-fft/shaders.js)         |
| `fft-2d`            | [2D FFT → spatial filtering → inverse](./fft-2d/index.js)          | [shaders.js](./fft-2d/shaders.js)            |
| `correlation`       | [Template cross-correlation](./correlation/index.js)               | [shaders.js](./correlation/shaders.js)       |
| `interference`      | [Wave interference](./interference/index.js)                       | [shaders.js](./interference/shaders.js)      |
| `diffraction`       | [Seven-slit diffraction](./diffraction/index.js)                   | [shaders.js](./diffraction/shaders.js)       |
| `streaming-biquad`  | [Streaming multichannel IIR filters](./streaming-biquad/index.js)  | [shaders.js](./streaming-biquad/shaders.js)  |
| `stft`              | [Windowed FFT spectrogram](./stft/index.js)                        | [shaders.js](./stft/shaders.js)              |
| `coherence`         | [Magnitude-squared spectral coherence](./coherence/index.js)       | [shaders.js](./coherence/shaders.js)         |
| `overlap-add`       | [Block FIR overlap-add convolution](./overlap-add/index.js)        | [shaders.js](./overlap-add/shaders.js)       |
| `haar-wavelet`      | [Haar wavelet denoising](./haar-wavelet/index.js)                  | [shaders.js](./haar-wavelet/shaders.js)      |
| `hilbert-envelope`  | [Hilbert FIR envelope detection](./hilbert-envelope/index.js)      | [shaders.js](./hilbert-envelope/shaders.js)  |
| `phase-correlation` | [FFT phase-correlation registration](./phase-correlation/index.js) | [shaders.js](./phase-correlation/shaders.js) |

## Parallel algorithms

Scans, statistics, dense and sparse linear algebra, clustering, hashing and graph traversal.

| ID                  | Setup and update                                               | Shader source                                |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| `implicit-chain`    | [Implicit compute chain](./implicit-chain/index.js)            | [shaders.js](./implicit-chain/shaders.js)    |
| `histogram`         | [Atomic histogram → summary → display](./histogram/index.js)   | [shaders.js](./histogram/shaders.js)         |
| `reduction`         | [Workgroup parallel reduction](./reduction/index.js)           | [shaders.js](./reduction/shaders.js)         |
| `matrix`            | [Tiled matrix multiplication](./matrix/index.js)               | [shaders.js](./matrix/shaders.js)            |
| `sort`              | [Bitonic sorting network](./sort/index.js)                     | [shaders.js](./sort/shaders.js)              |
| `scan`              | [Parallel prefix scan](./scan/index.js)                        | [shaders.js](./scan/shaders.js)              |
| `compact`           | [Stream compaction](./compact/index.js)                        | [shaders.js](./compact/shaders.js)           |
| `nearest`           | [All-pairs nearest neighbors](./nearest/index.js)              | [shaders.js](./nearest/shaders.js)           |
| `rle`               | [Parallel run-length encoding](./rle/index.js)                 | [shaders.js](./rle/shaders.js)               |
| `spatial`           | [Atomic spatial binning](./spatial/index.js)                   | [shaders.js](./spatial/shaders.js)           |
| `exclusive-scan`    | [Exclusive parallel scan](./exclusive-scan/index.js)           | [shaders.js](./exclusive-scan/shaders.js)    |
| `segmented-scan`    | [Segmented prefix sums](./segmented-scan/index.js)             | [shaders.js](./segmented-scan/shaders.js)    |
| `l2-norm`           | [Parallel L2 norm](./l2-norm/index.js)                         | [shaders.js](./l2-norm/shaders.js)           |
| `argmax`            | [Argmax with a stable index](./argmax/index.js)                | [shaders.js](./argmax/shaders.js)            |
| `variance`          | [Stable mean and variance](./variance/index.js)                | [shaders.js](./variance/shaders.js)          |
| `softmax`           | [Stable multi-pass softmax](./softmax/index.js)                | [shaders.js](./softmax/shaders.js)           |
| `row-normalization` | [Row-wise feature normalization](./row-normalization/index.js) | [shaders.js](./row-normalization/shaders.js) |
| `cosine-similarity` | [Pairwise cosine similarity](./cosine-similarity/index.js)     | [shaders.js](./cosine-similarity/shaders.js) |
| `batched-dot`       | [Batched vector dot products](./batched-dot/index.js)          | [shaders.js](./batched-dot/shaders.js)       |
| `sparse-matvec`     | [CSR sparse matrix × vector](./sparse-matvec/index.js)         | [shaders.js](./sparse-matvec/shaders.js)     |
| `jacobi`            | [Jacobi relaxation solver](./jacobi/index.js)                  | [shaders.js](./jacobi/shaders.js)            |
| `kmeans`            | [K-means assignment and centroid updates](./kmeans/index.js)   | [shaders.js](./kmeans/shaders.js)            |
| `gpu-hash`          | [Atomic GPU hash table](./gpu-hash/index.js)                   | [shaders.js](./gpu-hash/shaders.js)          |
| `graph-bfs`         | [GPU breadth-first grid traversal](./graph-bfs/index.js)       | [shaders.js](./graph-bfs/shaders.js)         |

## Image processing

Generate, filter and sample textures, or answer box queries with a summed-area table.

| ID                       | Setup and update                                                          | Shader source                                     |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------- |
| `texture-chain`          | [Generate → blur → sample](./texture-chain/index.js)                      | [shaders.js](./texture-chain/shaders.js)          |
| `integral`               | [Summed-area table → box queries](./integral/index.js)                    | [shaders.js](./integral/shaders.js)               |
| `sobel`                  | [Sobel edge detection](./sobel/index.js)                                  | [shaders.js](./sobel/shaders.js)                  |
| `bloom`                  | [Bright-pass bloom](./bloom/index.js)                                     | [shaders.js](./bloom/shaders.js)                  |
| `sharpen`                | [Unsharp edge enhancement](./sharpen/index.js)                            | [shaders.js](./sharpen/shaders.js)                |
| `emboss`                 | [Directional emboss](./emboss/index.js)                                   | [shaders.js](./emboss/shaders.js)                 |
| `pixelate`               | [Pixelation](./pixelate/index.js)                                         | [shaders.js](./pixelate/shaders.js)               |
| `dither`                 | [Stochastic dithering](./dither/index.js)                                 | [shaders.js](./dither/shaders.js)                 |
| `chromatic`              | [Chromatic separation](./chromatic/index.js)                              | [shaders.js](./chromatic/shaders.js)              |
| `mosaic`                 | [Mosaic averaging](./mosaic/index.js)                                     | [shaders.js](./mosaic/shaders.js)                 |
| `convolution`            | [Storage-buffer image convolution](./convolution/index.js)                | [shaders.js](./convolution/shaders.js)            |
| `median-filter`          | [Parallel median denoising](./median-filter/index.js)                     | [shaders.js](./median-filter/shaders.js)          |
| `dct-compression`        | [8×8 DCT image compression](./dct-compression/index.js)                   | [shaders.js](./dct-compression/shaders.js)        |
| `histogram-equalization` | [Histogram → CDF → image equalization](./histogram-equalization/index.js) | [shaders.js](./histogram-equalization/shaders.js) |

## Procedural visuals

Fractals, distance fields, noise, coordinate mapping and volumes.

| ID             | Setup and update                              | Shader source                           |
| -------------- | --------------------------------------------- | --------------------------------------- |
| `mandelbrot`   | [Mandelbrot](./mandelbrot/index.js)           | [shaders.js](./mandelbrot/shaders.js)   |
| `julia`        | [Julia orbit](./julia/index.js)               | [shaders.js](./julia/shaders.js)        |
| `burning-ship` | [Burning Ship](./burning-ship/index.js)       | [shaders.js](./burning-ship/shaders.js) |
| `metaballs`    | [Metaball field](./metaballs/index.js)        | [shaders.js](./metaballs/shaders.js)    |
| `voronoi`      | [Animated Voronoi](./voronoi/index.js)        | [shaders.js](./voronoi/shaders.js)      |
| `terrain`      | [Fractal terrain](./terrain/index.js)         | [shaders.js](./terrain/shaders.js)      |
| `warp`         | [Domain warping](./warp/index.js)             | [shaders.js](./warp/shaders.js)         |
| `kaleidoscope` | [Polar kaleidoscope](./kaleidoscope/index.js) | [shaders.js](./kaleidoscope/shaders.js) |
| `tunnel`       | [Polar tunnel](./tunnel/index.js)             | [shaders.js](./tunnel/shaders.js)       |
| `newton`       | [Newton basins](./newton/index.js)            | [shaders.js](./newton/shaders.js)       |
| `gyroid`       | [Gyroid volume](./gyroid/index.js)            | [shaders.js](./gyroid/shaders.js)       |
| `menger`       | [Menger sponge](./menger/index.js)            | [shaders.js](./menger/shaders.js)       |
| `caustics`     | [Refracted caustics](./caustics/index.js)     | [shaders.js](./caustics/shaders.js)     |
