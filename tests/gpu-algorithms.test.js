import test, { after } from "node:test";
import assert from "node:assert/strict";
import { create, globals } from "webgpu";
import { WebGPUjs } from "../src/pipeline";
import { disposeExample } from "../example/editor-session.js";
import { setup as streamingSetup } from "../example/demos/streaming-biquad/index.js";
import { filterBlock } from "../example/demos/streaming-biquad/reference.js";
import demo0 from "../example/demos/exclusive-scan/index.js";
import { reference as reference0 } from "../example/demos/exclusive-scan/reference.js";
import demo1 from "../example/demos/segmented-scan/index.js";
import { reference as reference1 } from "../example/demos/segmented-scan/reference.js";
import demo2 from "../example/demos/l2-norm/index.js";
import { reference as reference2 } from "../example/demos/l2-norm/reference.js";
import demo3 from "../example/demos/argmax/index.js";
import { reference as reference3 } from "../example/demos/argmax/reference.js";
import demo4 from "../example/demos/variance/index.js";
import { reference as reference4 } from "../example/demos/variance/reference.js";
import demo5 from "../example/demos/softmax/index.js";
import { reference as reference5 } from "../example/demos/softmax/reference.js";
import demo6 from "../example/demos/row-normalization/index.js";
import { reference as reference6 } from "../example/demos/row-normalization/reference.js";
import demo7 from "../example/demos/cosine-similarity/index.js";
import { reference as reference7 } from "../example/demos/cosine-similarity/reference.js";
import demo8 from "../example/demos/batched-dot/index.js";
import { reference as reference8 } from "../example/demos/batched-dot/reference.js";
import demo9 from "../example/demos/sparse-matvec/index.js";
import { reference as reference9 } from "../example/demos/sparse-matvec/reference.js";
import demo10 from "../example/demos/jacobi/index.js";
import { reference as reference10 } from "../example/demos/jacobi/reference.js";
import demo11 from "../example/demos/convolution/index.js";
import { reference as reference11 } from "../example/demos/convolution/reference.js";
import demo12 from "../example/demos/median-filter/index.js";
import { reference as reference12 } from "../example/demos/median-filter/reference.js";
import demo13 from "../example/demos/kmeans/index.js";
import { reference as reference13 } from "../example/demos/kmeans/reference.js";
import demo14 from "../example/demos/gpu-hash/index.js";
import { reference as reference14 } from "../example/demos/gpu-hash/reference.js";
import demo15 from "../example/demos/graph-bfs/index.js";
import { reference as reference15 } from "../example/demos/graph-bfs/reference.js";
import demo16 from "../example/demos/stft/index.js";
import { reference as reference16 } from "../example/demos/stft/reference.js";
import demo17 from "../example/demos/coherence/index.js";
import { reference as reference17 } from "../example/demos/coherence/reference.js";
import demo18 from "../example/demos/overlap-add/index.js";
import { reference as reference18 } from "../example/demos/overlap-add/reference.js";
import demo19 from "../example/demos/dct-compression/index.js";
import { reference as reference19 } from "../example/demos/dct-compression/reference.js";
import demo20 from "../example/demos/haar-wavelet/index.js";
import { reference as reference20 } from "../example/demos/haar-wavelet/reference.js";
import demo21 from "../example/demos/hilbert-envelope/index.js";
import { reference as reference21 } from "../example/demos/hilbert-envelope/reference.js";
import demo22 from "../example/demos/phase-correlation/index.js";
import { reference as reference22 } from "../example/demos/phase-correlation/reference.js";
import demo23 from "../example/demos/voxel-workgroups/index.js";
import { reference as reference23 } from "../example/demos/voxel-workgroups/reference.js";
import demo24 from "../example/demos/histogram-equalization/index.js";
import { reference as reference24 } from "../example/demos/histogram-equalization/reference.js";

Object.assign(globalThis, globals);
const gpu = create([]);
navigator.gpu = gpu;
const adapter = await gpu.requestAdapter();
const device = await adapter.requestDevice();
const errors = [];
device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
after(() => {
  device.destroy();
  assert.deepEqual(errors, []);
});
function target() {
  const texture = device.createTexture({
    size: [64, 64],
    format: gpu.getPreferredCanvasFormat(),
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  return {
    texture,
    canvas: {
      width: 64,
      height: 64,
      getContext() {
        return {
          configure() {},
          getCurrentTexture() {
            return texture;
          },
        };
      },
    },
  };
}
function close(actual, expected, label) {
  assert.equal(actual.length, expected.length, label);
  for (let i = 0; i < actual.length; i++)
    assert.ok(
      Number.isFinite(actual[i]) && Math.abs(actual[i] - expected[i]) < 0.003,
      label + " at " + i + ": " + actual[i] + " vs " + expected[i],
    );
}
async function checked(run) {
  device.pushErrorScope("validation");
  try {
    await run();
  } finally {
    await device.queue.onSubmittedWorkDone();
    const error = await device.popErrorScope();
    assert.equal(error, null, error?.message);
  }
}
const studies = [
  [demo0, reference0],
  [demo1, reference1],
  [demo2, reference2],
  [demo3, reference3],
  [demo4, reference4],
  [demo5, reference5],
  [demo6, reference6],
  [demo7, reference7],
  [demo8, reference8],
  [demo9, reference9],
  [demo10, reference10],
  [demo11, reference11],
  [demo12, reference12],
  [demo13, reference13],
  [demo14, reference14],
  [demo15, reference15],
  [demo16, reference16],
  [demo17, reference17],
  [demo18, reference18],
  [demo19, reference19],
  [demo20, reference20],
  [demo21, reference21],
  [demo22, reference22],
  [demo23, reference23],
  [demo24, reference24],
];
for (const [definition, reference] of studies)
  test(
    "GPU math: " +
      definition.id +
      " agrees with a CPU reference before and after controls/reset",
    () =>
      checked(async () => {
        const { canvas, texture } = target();
        const demo = await definition.setup(canvas, device);
        try {
          for (let run = 0; run < 2; run++) {
            const controls = Object.fromEntries(
              (definition.controls ?? []).map(
                ([key, , min, max, step, value]) => [
                  key,
                  run ? Math.min(max, value + step * 2) : value,
                ],
              ),
            );
            if (run) demo.reset?.();
            await demo.frame(run * 1000, controls);

            const view = demo.pipelines.at(-1);
            for (const [name, binding] of Object.entries(
              view.options.resourceBindings || {},
            )) {
              const descriptor = view.fragment?.resources.find(
                (resource) =>
                  resource.name === name && resource.kind === "buffer",
              );
              if (!descriptor) continue;
              assert.equal(
                view.resources.get(descriptor.resource)?.buffer,
                demo.chain.getBuffer(binding.resource),
                definition.id +
                  " renderer must use the real " +
                  binding.resource +
                  " allocation",
              );
            }
            close(
              await demo.chain.read(demo.resultName),
              reference(demo.input),
              definition.id + " run " + run,
            );
          }
        } finally {
          disposeExample({ demo, helpers: demo.pipelines });
          texture.destroy();
        }
      }),
  );
test("GPU math: streaming IIR retains independent state over three blocks and 256 channels", () =>
  checked(async () => {
    const { canvas, texture } = target();
    const demo = await streamingSetup(canvas, device),
      states = demo.filters.map(() => new Float64Array(512));
    try {
      for (let block = 0; block < 3; block++) {
        if (block) await demo.frame(block * 250);
        const output = await demo.chain.read(["signal", "filtered"]);
        let expected = output.signal;
        for (let i = 0; i < demo.filters.length; i++)
          expected = filterBlock(expected, demo.filters[i], states[i]);
        close(output.filtered, expected, "stateful block " + block);
      }
    } finally {
      disposeExample({ demo, helpers: demo.pipelines });
      texture.destroy();
    }
  }));
test("GPU chaining: a later implicit name reuses an earlier explicit alias", () =>
  checked(async () => {
    const chain = await WebGPUjs.createComputeChain(
      [
        {
          shader: (partial = "array<f32>") => {
            partial[threadId.x] *= 2;
          },
          resources: { partial: "total" },
        },
        (total = "array<f32>") => {
          total[threadId.x] += 1;
        },
      ],
      { device },
    );
    assert.deepEqual(
      Array.from(
        await chain.run(
          { total: new Float32Array([1, 2, 3]) },
          { readback: "total" },
        ),
      ),
      [3, 5, 7],
    );
    assert.equal(
      chain.passes[0].compute.resources[0].resource,
      chain.passes[1].compute.resources[0].resource,
    );
    disposeExample({ helpers: chain.passes });
  }));
