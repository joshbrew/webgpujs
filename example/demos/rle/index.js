// Parallel run-length encoding
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  heatmapUnsigned,
  markRuns,
  scatterRuns,
  scanUnsigned,
} from "./shaders.js";

const demoDefinition = {
  id: "rle",
  controls: [["runWidth", "Run width", 1, 32, 1, 8]],
  title: "Parallel run-length encoding",
  description:
    "Detect boundaries, scan run IDs, then scatter values and lengths into compact outputs. Multiple named result buffers are read together.",
  mode: "rle",
  category: "Parallel algorithms",
  algorithm: true,
};

function createPlan() {
  {
    const scan = unsignedScanStages(128);
    return {
      stages: [
        {
          shader: markRuns,
          resources: { input: "input", flags: "flags-A" },
        },
        ...scan.stages,
        {
          shader: scatterRuns,
          resources: {
            input: "input",
            prefix: scan.current,
            runValues: "run-values",
            runLengths: "run-lengths",
            count: "count",
          },
        },
      ],
      read: ["run-values", "run-lengths", "count"],
      view: "run-lengths",
      width: 16,
      unsigned: true,
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
    input: Uint32Array.from(
      { length: 128 },
      (_, i) => Math.floor(i / Math.round(controls.runWidth ?? 8)) % 7,
    ),
    "flags-A": new Uint32Array(128),
    "flags-B": new Uint32Array(128),
    "run-values": new Uint32Array(128),
    "run-lengths": new Uint32Array(128),
    count: new Uint32Array(1),
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

      summary = `128 values → ${results.count[0]} runs. First (value × length): ${Array.from(results["run-values"].slice(0, Math.min(8, results.count[0])), (v, i) => `${v} × ${results["run-lengths"][i]}`).join(", ")}`;
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

export { createPlan, createInputs, unsignedScanStages };
