import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Segmented prefix sums: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { segmented, display } from "./shaders.js";

function createPlan() {
  const stages = [];
  let current = "A",
    heads = "heads-A";
  for (let offset = 1; offset < 256; offset *= 2) {
    const next = current === "A" ? "B" : "A",
      nextHeads = heads === "heads-A" ? "heads-B" : "heads-A";
    stages.push({
      shader: segmented,
      resources: { state: current, heads, next, nextHeads },
      inputs: { offset },
    });
    current = next;
    heads = nextHeads;
  }
  return stages;
}
function createInputs(controls = {}, seed = 0) {
  return {
    A: Float32Array.from({ length: 256 }, (_, i) => 1 + (i % 3)),
    B: new Float32Array(256),
    "heads-A": Uint32Array.from({ length: 256 }, (_, i) =>
      i % Math.round(controls.segment ?? 17) === 0 ? 1 : 0,
    ),
    "heads-B": new Uint32Array(256),
  };
}

export async function setup(canvas, device) {
  const stages = createPlan();
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  let seed = 0,
    previous = "",
    input;
  const inspector = createValueInspector(16);
  const resultName = "A";
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
        scale: 0.1 * (controls.gain ?? 1),
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
        "Prefix sums restart at marked boundaries. Value and segment propagation travel together through ping-pong buffers." +
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
  id: "segmented-scan",
  title: "Segmented prefix sums",
  description:
    "Prefix sums restart at marked boundaries. Value and segment propagation travel together through ping-pong buffers.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["segment", "Samples per segment", 4, 32, 1, 17],
    ["viewMode", "View", 0, 1, 1, 0, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
