import test, { after } from "node:test";
import assert from "node:assert/strict";
import { create, globals } from "webgpu";
import { demos } from "../example/demos/index.js";
import { disposeExample } from "../example/editor-session.js";
Object.assign(globalThis, globals);
const gpu = create([]);
navigator.gpu = gpu;
const adapter = await gpu.requestAdapter(),
  device = await adapter.requestDevice(),
  errors = [];
device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
after(() => {
  device.destroy();
  assert.deepEqual(errors, []);
});
function target() {
  const texture = device.createTexture({
    size: [128, 96],
    format: gpu.getPreferredCanvasFormat(),
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  return {
    texture,
    canvas: {
      width: 128,
      height: 96,
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
async function pixels(demo, texture) {
  return demo.pipelines
    .at(-1)
    .fragment.getOutputData(device.createCommandEncoder(), { image: texture });
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
const ids = [
  "cosine-similarity",
  "batched-dot",
  "sparse-matvec",
  "jacobi",
  "kmeans",
  "gpu-hash",
  "graph-bfs",
  "batch-fft",
  "streaming-biquad",
  "stft",
  "coherence",
  "overlap-add",
  "hilbert-envelope",
  "phase-correlation",
  "correlation",
];
for (const id of ids)
  test(
    "GPU visual result: " +
      id +
      " displays data, not an empty-buffer background",
    () =>
      checked(async () => {
        const { canvas, texture } = target(),
          definition = demos.find((d) => d.id === id),
          demo = await definition.setup(canvas, device);
        try {
          const controls = Object.fromEntries(
            (definition.controls || []).map(([key, , , , , value]) => [
              key,
              value,
            ]),
          );
          await demo.frame(1000, controls);
          const image = await pixels(demo, texture);
          let low = 255,
            high = 0,
            bright = 0;
          for (let i = 0; i < image.length; i += 4) {
            const v = Math.max(image[i], image[i + 1], image[i + 2]);
            low = Math.min(low, v);
            high = Math.max(high, v);
            if (v > 70) bright++;
          }
          assert.ok(high - low > 45, id + " needs visible data contrast");
          assert.ok(
            bright > 15,
            id + " needs meaningful colored output, not only an empty grid",
          );
          if (id === "kmeans") {
            let teal = 0,
              orange = 0,
              violet = 0;
            const redIndex = gpu.getPreferredCanvasFormat().startsWith("bgra")
                ? 2
                : 0,
              blueIndex = 2 - redIndex;
            for (let i = 0; i < image.length; i += 4) {
              const r = image[i + redIndex],
                g = image[i + 1],
                b = image[i + blueIndex];
              if (g > 140 && r < 100) teal++;
              if (r > 170 && g < 180) orange++;
              if (b > 170 && r < 170 && g < 190) violet++;
            }
            assert.ok(
              teal > 10 && orange > 10 && violet > 10,
              "all three colored point clouds must be rendered",
            );
          }
          if (id === "cosine-similarity") {
            const current = demo.chain.getBuffer("result"),
              descriptor = demo.pipelines
                .at(-1)
                .fragment.resources.find((r) => r.name === "values");
            assert.equal(
              demo.pipelines.at(-1).resources.get(descriptor.resource).buffer,
              current,
            );
            await demo.frame(1000, { ...controls, separation: 0.8 });
            const next = await pixels(demo, texture);
            assert.ok(
              image.some((v, i) => Math.abs(v - next[i]) > 30),
              "vector-angle control must visibly change the similarity matrix",
            );
          }
          if (id === "graph-bfs") {
            await demo.frame(1000, {
              ...controls,
              pointer: [0.7, 0.7],
              down: true,
            });
            assert.equal(demo.input.distances.indexOf(0), 187);
            const next = await pixels(demo, texture);
            assert.ok(
              image.some((v, i) => Math.abs(v - next[i]) > 30),
              "moving the source must change the BFS field",
            );
          }
        } finally {
          disposeExample({ demo, helpers: demo.pipelines });
          texture.destroy();
        }
      }),
  );
for (const id of ["ocean", "tunnel"])
  test(
    "GPU interaction: " + id + " changes its camera/view with pointer movement",
    () =>
      checked(async () => {
        const { canvas, texture } = target(),
          demo = await demos.find((d) => d.id === id).setup(canvas, device);
        try {
          await demo.frame(1000);
          const before = await pixels(demo, texture);
          await demo.frame(1000, { pointer: [0.75, 0.5] });
          const after = await pixels(demo, texture);
          let changed = 0;
          for (let i = 0; i < before.length; i += 4)
            if (
              Math.abs(before[i] - after[i]) +
                Math.abs(before[i + 1] - after[i + 1]) +
                Math.abs(before[i + 2] - after[i + 2]) >
              20
            )
              changed++;
          assert.ok(
            changed > 128,
            "pointer movement must visibly change the view",
          );
        } finally {
          disposeExample({ demo, helpers: demo.pipelines });
          texture.destroy();
        }
      }),
  );

const inspectorIds = [
  "exclusive-scan",
  "segmented-scan",
  "l2-norm",
  "argmax",
  "variance",
  "softmax",
  "row-normalization",
  "cosine-similarity",
  "batched-dot",
  "sparse-matvec",
];
for (const id of inspectorIds)
  test("GPU algorithm controls and status: " + id, () =>
    checked(async () => {
      const { canvas, texture } = target(),
        definition = demos.find((d) => d.id === id),
        demo = await definition.setup(canvas, device),
        defaults = Object.fromEntries(
          definition.controls.map(([key, , , , , value]) => [key, value]),
        );
      function visiblyChanged(before, after, label) {
        let changed = 0;
        for (let i = 0; i < before.length; i += 4)
          if (
            Math.max(
              ...[0, 1, 2].map((c) => Math.abs(before[i + c] - after[i + c])),
            ) > 8
          )
            changed++;
        assert.ok(
          changed > 12,
          label + " must change the displayed result (" + changed + " pixels)",
        );
      }
      async function draw(controls) {
        await demo.frame(1000, controls);
        assert.match(
          demo.resultInfo,
          /output values · range/,
          "gallery status must remain readable after every update",
        );
        return pixels(demo, texture);
      }
      try {
        const base = await draw(defaults),
          original = (await demo.chain.read(demo.resultName)).slice();
        for (const [
          key,
          title,
          min,
          max,
          step,
          initial,
        ] of definition.controls) {
          const value =
            key === "viewMode"
              ? 1 - initial
              : initial !== min
                ? min
                : min + Math.round(((max - min) * 0.55) / step) * step;
          const next = await draw({ ...defaults, [key]: value });
          visiblyChanged(base, next, title);
          const actual = await demo.chain.read(demo.resultName);
          if (!["viewMode", "gain"].includes(key))
            assert.ok(
              original.some((v, i) => Math.abs(v - actual[i]) > 1e-5),
              title + " must change GPU data",
            );
          else
            assert.deepEqual(
              actual,
              original,
              title + " must only change presentation",
            );
          await draw(defaults);
        }
        const hover = await draw({ ...defaults, pointer: [0.4, 0.4] });
        assert.match(
          demo.resultInfo,
          /Index \d+.* = /,
          "hover status exposes the selected GPU value",
        );
        visiblyChanged(base, hover, "Hover");
        const away = await draw(defaults);
        assert.match(demo.resultInfo, /Hover the preview/);
        assert.deepEqual(
          away,
          base,
          "hover highlight clears without changing the result",
        );
      } finally {
        disposeExample({ demo, helpers: demo.pipelines });
        texture.destroy();
      }
    }),
  );
