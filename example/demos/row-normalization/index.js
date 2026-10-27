import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Row-wise feature normalization: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { rowStats, standardize, display } from "./shaders.js";

function createPlan() {
  return [
    { shader: rowStats, inputs: { width: 16 } },
    { shader: standardize, inputs: { width: 16 } },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 256 },
      (_, i) =>
        Math.floor(i / 16) * 2 +
        Math.sin(i * 0.2 + seed + (controls.phase ?? 0)) * (1 + (i % 5)),
    ),
    stats: new Float32Array(32),
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
        scale: 0.4 * (controls.gain ?? 1),
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
        "One invocation computes each row’s statistics; a second pass standardizes every feature. Independent rows run in parallel." +
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
  id: "row-normalization",
  title: "Row-wise feature normalization",
  description:
    "One invocation computes each row’s statistics; a second pass standardizes every feature. Independent rows run in parallel.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["phase", "Feature phase", 0, 6.28, 0.1, 0],
    ["viewMode", "View", 0, 1, 1, 0, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
