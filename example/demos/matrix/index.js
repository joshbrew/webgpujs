// Tiled matrix multiplication
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { heatmapFloat, tiledMatrix } from "./shaders.js";

const demoDefinition = {
  id: "matrix",
  controls: [["amplitude", "Left matrix amplitude", 0.1, 3, 0.1, 1]],
  title: "Tiled matrix multiplication",
  description:
    "An 8×8 two-dimensional workgroup cooperatively loads tiles and computes a 16×16 matrix product. Native WGSL shares resources with a JavaScript visualizer.",
  mode: "matrix",
  category: "Parallel algorithms",
  algorithm: true,
};

function createPlan() {
  return {
    stages: [
      {
        shader: tiledMatrix,
        resources: {
          leftMatrix: "left",
          rightMatrix: "right",
          product: "product",
        },
        inputs: { dimension: 16 },
        options: { computePass: { workgroupsX: 2, workgroupsY: 2 } },
      },
    ],
    read: ["product"],
    view: "product",
    width: 16,
  };
}

function createInputs(controls = {}, seed = 0) {
  return {
    left: Float32Array.from(
      { length: 256 },
      (_, i) => Math.sin(i * 0.2 + seed) * 0.2 * (controls.amplitude ?? 1),
    ),
    right: Float32Array.from(
      { length: 256 },
      (_, i) => Math.cos(i * 0.1 + seed) * 0.2,
    ),
    product: new Float32Array(256),
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
    heatmapFloat,
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

      summary = `16×16 · 8×8 workgroup tiles · two shared-memory tiles per output. First row: ${Array.from(results.product.slice(0, 6), (v) => v.toFixed(3)).join(", ")}`;
    }
    const maximum = 0.08;
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
