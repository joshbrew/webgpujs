import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Parallel L2 norm: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { squares, reduceSum, root, display } from "./shaders.js";

function createPlan() {
  return [
    { shader: squares },
    {
      shader: reduceSum,
      resources: { sourceValues: "squared", partials: "partials" },
      options: {
        workGroupSize: 64,
        workgroupVariables: { scratch: "array<f32,64>" },
        computePass: { workgroupsX: 4 },
      },
    },
    {
      shader: reduceSum,
      resources: { sourceValues: "partials", partials: "total" },
      options: {
        workGroupSize: 64,
        workgroupVariables: { scratch: "array<f32,64>" },
        computePass: { workgroupsX: 1 },
      },
    },
    { shader: root },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 256 },
      (_, i) =>
        (Math.sin(i * 0.23 + seed) * 0.5 + 0.5) * (controls.amplitude ?? 1),
    ),
    squared: new Float32Array(256),
    partials: new Float32Array(4),
    total: new Float32Array(1),
    result: new Float32Array(1),
  };
}

export async function setup(canvas, device) {
  const stages = createPlan();
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  let seed = 0,
    previous = "",
    input;
  const inspector = createValueInspector(1);
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
        columns: 1,
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
        "Shared-memory reductions sum squared values, then take one square root. The GPU retains partial sums between passes." +
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
  id: "l2-norm",
  title: "Parallel L2 norm",
  description:
    "Shared-memory reductions sum squared values, then take one square root. The GPU retains partial sums between passes.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["amplitude", "Input amplitude", 0.1, 3, 0.1, 1],
    ["viewMode", "View", 0, 1, 1, 1, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
