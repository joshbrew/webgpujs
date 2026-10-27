// Summed-area table → box queries
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { heatmapFloat, scanImage, boxAverage } from "./shaders.js";

const demoDefinition = {
  id: "integral",
  controls: [["radius", "Box radius", 0, 10, 1, 3]],
  title: "Summed-area table → box queries",
  description:
    "Row and column scans build an integral image. A final pass averages arbitrary-size windows with four lookups per output pixel.",
  mode: "integral",
  category: "Parallel algorithms",
  algorithm: true,
};

function createPlan() {
  {
    const stages = [];
    let current = "image-A";
    for (let axis = 0; axis < 2; axis++)
      for (let offset = 1; offset < 32; offset *= 2) {
        const next = current === "image-A" ? "image-B" : "image-A";
        stages.push({
          shader: scanImage,
          resources: { state: current, next },
          inputs: { width: 32, offset, axis },
        });
        current = next;
      }
    stages.push({
      shader: boxAverage,
      resources: { integral: current, result: "average" },
      inputs: { width: 32 },
    });
    return { stages, read: ["average"], view: "average", width: 32 };
  }

  throw new Error(`Unknown algorithm ${mode}`);
}

function createInputs(controls = {}, seed = 0) {
  return {
    "image-A": Float32Array.from(
      { length: 1024 },
      (_, i) => ((i % 32 >> 2) + (Math.floor(i / 32) >> 2) + seed) % 2,
    ),
    "image-B": new Float32Array(1024),
    average: new Float32Array(1024),
    radius: Math.round(controls.radius ?? 3),
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

      summary = `32×32 summed-area table · 10 scan passes · ${inputs.radius * 2 + 1}×${inputs.radius * 2 + 1} box average from four table lookups per pixel.`;
    }
    const maximum = 1;
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
