// Stream compaction
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  heatmapFloat,
  markSelected,
  scatterSelected,
  scanUnsigned,
} from "./shaders.js";

const demoDefinition = {
  id: "compact",
  controls: [["threshold", "Selection threshold", 0, 1, 0.05, 0.5]],
  title: "Stream compaction",
  description:
    "Flag samples above a threshold, prefix-scan the flags, then scatter the selected values into a dense output buffer.",
  mode: "compact",
  category: "Parallel algorithms",
  algorithm: true,
};

function createPlan() {
  const n = 256;

  {
    const scan = unsignedScanStages(n);
    return {
      stages: [
        {
          shader: markSelected,
          resources: { input: "input", flags: "flags-A" },
        },
        ...scan.stages,
        {
          shader: scatterSelected,
          resources: {
            input: "input",
            prefix: scan.current,
            packed: "packed",
            count: "count",
          },
        },
      ],
      read: ["packed", "count"],
      view: "packed",
      width: 16,
    };
  }

  throw new Error(`Unknown algorithm ${mode}`);
}

function createInputs(controls = {}, seed = 0) {
  const noise = (i) => {
    const v = Math.sin((i + seed * 17) * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const input = Float32Array.from({ length: 256 }, (_, i) => noise(i));

  return {
    input,
    "flags-A": new Uint32Array(256),
    "flags-B": new Uint32Array(256),
    packed: new Float32Array(256),
    count: new Uint32Array(1),
    threshold: controls.threshold ?? 0.5,
  };
}

function unsignedScanStages(count) {
  const stages = [];
  let current = "flags-A";
  for (let offset = 1; offset < count; offset *= 2) {
    const next = current === "flags-A" ? "flags-B" : "flags-A";
    stages.push({
      shader: scanUnsigned,
      resources: { state: current, next },
      inputs: { offset },
    });
    current = next;
  }
  return { stages, current };
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

      summary = `${results.count[0]} of 256 samples exceed ${inputs.threshold}. Grid: packed values followed by cleared capacity.`;
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

export { createPlan, createInputs, unsignedScanStages };
