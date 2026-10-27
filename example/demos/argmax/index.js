import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Argmax with a stable index: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { pack, maximum, highlight, display } from "./shaders.js";

function createPlan() {
  const stage = (groups) => ({
    workGroupSize: 64,
    workgroupVariables: { scratch: "array<vec2f,64>" },
    computePass: { workgroupsX: groups },
  });
  return [
    { shader: pack },
    {
      shader: maximum,
      resources: { sourceValues: "pairs", partials: "partials" },
      options: stage(4),
    },
    {
      shader: maximum,
      resources: { sourceValues: "partials", partials: "winner" },
      options: stage(1),
    },
    { shader: highlight },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 256 },
      (_, i) => Math.sin(i * 0.23 + seed + (controls.phase ?? 0)) * 0.5 + 0.5,
    ),
    pairs: new Float32Array(512),
    partials: new Float32Array(8),
    winner: new Float32Array(2),
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
        scale: 0.6 * (controls.gain ?? 1),
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
        "A value/index pair reduction finds the maximum, preserving the lowest index on ties. The final pass highlights its location." +
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
  id: "argmax",
  title: "Argmax with a stable index",
  description:
    "A value/index pair reduction finds the maximum, preserving the lowest index on ties. The final pass highlights its location.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["phase", "Peak phase", 0, 6.28, 0.1, 0],
    ["viewMode", "View", 0, 1, 1, 0, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
