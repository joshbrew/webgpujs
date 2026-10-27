import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Pairwise cosine similarity: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { cosine, display } from "./shaders.js";

function createPlan() {
  return [{ shader: cosine, inputs: { dimension: 16, count: 16 } }];
}
function createInputs(controls = {}, seed = 0) {
  return {
    vectors: Float32Array.from({ length: 256 }, (_, i) =>
      Math.sin(
        (i % 16) * 0.4 +
          Math.floor(i / 16) * (controls.separation ?? 0.25) +
          seed,
      ),
    ),
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
        scale: 1 * (controls.gain ?? 1),
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
        "A grid of GPU invocations compares every pair of 16-dimensional vectors. The symmetric Gram matrix reveals aligned and opposed features." +
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
  id: "cosine-similarity",
  title: "Pairwise cosine similarity",
  description:
    "A grid of GPU invocations compares every pair of 16-dimensional vectors. The symmetric Gram matrix reveals aligned and opposed features.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["separation", "Angle between vectors", 0, 1, 0.025, 0.25],
    ["viewMode", "View", 0, 1, 1, 0, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  legend: [
    ["#33e6b2", "Aligned (+1)"],
    ["#080f1c", "Orthogonal (0)"],
    ["#f24d59", "Opposed (−1)"],
  ],
  setup,
};
