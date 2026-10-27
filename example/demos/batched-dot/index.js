import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Batched vector dot products: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { dotBatch, display } from "./shaders.js";

function createPlan() {
  return [{ shader: dotBatch, inputs: { dimension: 32 } }];
}
function createInputs(controls = {}, seed = 0) {
  return {
    left: Float32Array.from({ length: 2048 }, (_, i) =>
      Math.sin((i % 32) * 0.2 + Math.floor(i / 32) * 0.05 + seed * 0.31),
    ),
    right: Float32Array.from({ length: 2048 }, (_, i) =>
      Math.sin((i % 32) * 0.2 + (controls.phase ?? 0.4)),
    ),
    result: new Float32Array(64),
  };
}

export async function setup(canvas, device) {
  const stages = createPlan();
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  let seed = 0,
    previous = "",
    input;
  const inspector = createValueInspector(8);
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
        columns: 8,
        scale: 0.08 * (controls.gain ?? 1),
        hoverIndex: inspector.setView(controls.pointer, controls.viewMode ?? 1),
        viewMode: controls.viewMode ?? 1,
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
        "Sixty-four independent vector pairs each reduce 32 features in parallel across the batch." +
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
  id: "batched-dot",
  title: "Batched vector dot products",
  description:
    "Sixty-four independent vector pairs each reduce 32 features in parallel across the batch.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["phase", "Relative phase", 0, 6.2, 0.1, 0.4],
    ["viewMode", "View", 0, 1, 1, 1, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
