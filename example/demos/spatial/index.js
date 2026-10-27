// Atomic spatial binning
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { heatmapUnsigned, binPoints } from "./shaders.js";

const demoDefinition = {
  id: "spatial",
  controls: [["spread", "Point spread", 0.1, 1, 0.05, 1]],
  title: "Atomic spatial binning",
  description:
    "512 points atomically reserve slots in a spatial grid. Counts are visualized; the per-bin index lists remain reusable GPU buffers.",
  mode: "spatial",
  category: "Parallel algorithms",
  algorithm: true,
};

function createPlan() {
  return {
    stages: [
      {
        shader: binPoints,
        resources: { points: "points", counts: "counts", slots: "slots" },
        inputs: { width: 8 },
      },
    ],
    read: ["counts"],
    view: "counts",
    width: 8,
    unsigned: true,
  };
}

function createInputs(controls = {}, seed = 0) {
  const noise = (i) => {
    const v = Math.sin((i + seed * 17) * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  return {
    points: Float32Array.from(
      { length: 1024 },
      (_, i) => 0.5 + (noise(i) - 0.5) * (controls.spread ?? 1),
    ),
    counts: new Uint32Array(64),
    slots: new Uint32Array(512 * 64),
  };
}

export async function setup(canvas, device, options = {}) {
  const definition = { ...demoDefinition, ...options };
  const plan = createPlan();
  const chain = await WebGPUjs.createComputeChain(plan.stages, { device });
  let seed = 0,
    previous = "",
    inputs,
    results,
    summary = "";
  await chain.run(createInputs());
  const display = await WebGPUjs.combineShaders(
    heatmapUnsigned,
    {
      canvas,
      resourceBindings: { values: { resource: plan.view } },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  async function frame(time, controls = {}) {
    const key = JSON.stringify([controls, seed]);
    if (key !== previous) {
      inputs = createInputs(controls, seed);
      results = await chain.run(inputs, { readback: plan.read });
      previous = key;

      summary = `${results.counts.reduce((a, b) => a + b, 0)} points → 64 spatial bins. Peak occupancy ${Math.max(...results.counts)}. Point indices stay on GPU in the slots buffer.`;
    }
    const maximum = 32;
    await display.render({}, undefined, plan.width, maximum);
  }
  return {
    pipelines: [...chain.passes, display],
    chain,
    frame,
    continuous: false,
    reset() {
      seed++;
      previous = "";
    },
    get results() {
      return results;
    },
    get input() {
      return inputs;
    },
    get resultInfo() {
      return summary;
    },
    info: "Adjust the controls or regenerate the data. Only final results are read back; intermediate passes share GPU allocations.",
  };
}

export default { ...demoDefinition, setup };

export { createPlan, createInputs };
