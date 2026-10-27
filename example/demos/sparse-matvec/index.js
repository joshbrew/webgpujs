import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// CSR sparse matrix × vector: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { sparseProduct, display } from "./shaders.js";

function createPlan() {
  return [{ shader: sparseProduct }];
}
function createInputs(controls = {}, seed = 0) {
  return {
    vector: Float32Array.from({ length: 64 }, (_, i) =>
      Math.sin(i * 0.2 + seed + (controls.phase ?? 0)),
    ),
    values: Float32Array.from(
      { length: 256 },
      (_, i) => [2, -0.5, 0.25, -0.125][i % 4],
    ),
    columns: Uint32Array.from(
      { length: 256 },
      (_, i) => (Math.floor(i / 4) + (i % 4) * 7) % 64,
    ),
    offsets: Uint32Array.from({ length: 65 }, (_, i) => i * 4),
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
        scale: 0.45 * (controls.gain ?? 1),
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
        "Compressed sparse rows skip zero entries. Each invocation walks one row’s nonzero values and gathers vector components." +
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
  id: "sparse-matvec",
  title: "CSR sparse matrix × vector",
  description:
    "Compressed sparse rows skip zero entries. Each invocation walks one row’s nonzero values and gathers vector components.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["phase", "Input vector phase", 0, 6.28, 0.1, 0],
    ["viewMode", "View", 0, 1, 1, 1, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
