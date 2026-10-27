// Workgroup parallel reduction
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { heatmapFloat, reduceWorkgroup } from "./shaders.js";

const demoDefinition = {
  id: "reduction",
  title: "Workgroup parallel reduction",
  description:
    "Two JavaScript passes reduce 256 numbers through shared workgroup memory and barriers. Only the final sums are copied back.",
  mode: "reduction",
  category: "Parallel algorithms",
  algorithm: true,
};

function createPlan() {
  return {
    stages: [
      {
        shader: reduceWorkgroup,
        resources: { sourceValues: "input", partials: "partials" },
        options: {
          workgroupVariables: { scratch: "array<f32,64>" },
          computePass: { workgroupsX: 4 },
        },
      },
      {
        shader: reduceWorkgroup,
        resources: { sourceValues: "partials", partials: "total" },
        options: {
          workgroupVariables: { scratch: "array<f32,64>" },
          computePass: { workgroupsX: 1 },
        },
      },
    ],
    read: ["total"],
    view: "partials",
    width: 4,
  };
}

function createInputs(controls = {}, seed = 0) {
  const noise = (i) => {
    const v = Math.sin((i + seed * 17) * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const input = Float32Array.from({ length: 256 }, (_, i) => noise(i));
  return { input, partials: new Float32Array(4), total: new Float32Array(1) };
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
      summary = `256 values → 4 workgroup partials → sum ${results.total[0].toFixed(5)}. Grid: the four partial sums.`;
    }
    const maximum = 64;
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
