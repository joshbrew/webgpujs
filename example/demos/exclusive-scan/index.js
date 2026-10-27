import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Exclusive parallel scan: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { scan, exclusive, display } from "./shaders.js";

function createPlan() {
  const stages = [];
  let current = "A";
  for (let offset = 1; offset < 256; offset *= 2) {
    const next = current === "A" ? "B" : "A";
    stages.push({
      shader: scan,
      resources: { state: current, next },
      inputs: { offset },
    });
    current = next;
  }
  return [...stages, { shader: exclusive, resources: { inclusive: current } }];
}
function createInputs(controls = {}, seed = 0) {
  return {
    A: Float32Array.from(
      { length: 256 },
      (_, i) => 1 + ((i + seed) % Math.round(controls.cycle ?? 7)),
    ),
    B: new Float32Array(256),
    result: new Float32Array(256),
  };
}

export async function setup(canvas, device) {
  const stages = createPlan();
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  let seed = 0,
    previous = "",
    input;
  const inspector = createValueInspector(16);
  const resultName = "result";
  const displayPipeline = await WebGPUjs.combineShaders(
    display,
    {
      canvas,
      resourceBindings: { values: { resource: resultName } },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  async function frame(time, controls = {}) {
    const key = JSON.stringify([dataControls(controls), seed]);
    if (key !== previous) {
      input = createInputs(controls, seed);
      await chain.run(input);
      inspector.update(await chain.read(resultName));
      previous = key;
    }
    await displayPipeline.render({
      inputs: {
        columns: 16,
        scale: 0.00390625 * (controls.gain ?? 1),
        hoverIndex: inspector.setView(controls.pointer, controls.viewMode ?? 0),
        viewMode: controls.viewMode ?? 0,
      },
    });
  }
  return {
    pipelines: [...chain.passes, displayPipeline],
    chain,
    frame,
    continuous: false,
    reset() {
      seed++;
      previous = "";
    },
    get input() {
      return input;
    },
    resultName,
    get resultInfo() {
      return (
        "Seven parallel doubling passes produce exclusive prefix sums; the last stage shifts the inclusive result without a CPU copy." +
        "\n" +
        inspector.describe() +
        "\n" +
        stages.length +
        " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "exclusive-scan",
  title: "Exclusive parallel scan",
  description:
    "Seven parallel doubling passes produce exclusive prefix sums; the last stage shifts the inclusive result without a CPU copy.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["cycle", "Input cycle length", 2, 12, 1, 7],
    ["viewMode", "View", 0, 1, 1, 0, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
