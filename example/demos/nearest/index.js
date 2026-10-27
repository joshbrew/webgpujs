// All-pairs nearest neighbors
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { heatmapFloat, nearestNeighbors } from "./shaders.js";

const demoDefinition = {
  id: "nearest",
  controls: [["spread", "Point spread", 0.1, 1, 0.05, 1]],
  title: "All-pairs nearest neighbors",
  description:
    "128 invocations independently search all other points and return nearest indices and distances, useful for matching and spatial analysis.",
  mode: "nearest",
  category: "Parallel algorithms",
  algorithm: true,
};

function createPlan() {
  return {
    stages: [
      {
        shader: nearestNeighbors,
        resources: {
          points: "points",
          distances: "distances",
          neighbors: "neighbors",
        },
      },
    ],
    read: ["distances", "neighbors"],
    view: "distances",
    width: 16,
  };
}

function createInputs(controls = {}, seed = 0) {
  const noise = (i) => {
    const v = Math.sin((i + seed * 17) * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  return {
    points: Float32Array.from(
      { length: 256 },
      (_, i) => noise(i) * (controls.spread ?? 1),
    ),
    distances: new Float32Array(128),
    neighbors: new Uint32Array(128),
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

      summary = `128 points · 16,256 pairwise distances. First neighbor indices: ${Array.from(results.neighbors.slice(0, 8)).join(", ")}. Grid: nearest distances.`;
    }
    const maximum = 0.15;
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
