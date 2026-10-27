import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Stable mean and variance: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { moments, merge, statistics, display } from "./shaders.js";

function createPlan() {
  const stage = (groups) => ({
    workGroupSize: 64,
    workgroupVariables: { scratch: "array<vec4f,64>" },
    computePass: { workgroupsX: groups },
  });
  return [
    { shader: moments },
    {
      shader: merge,
      resources: { sourceValues: "records", partials: "partials" },
      options: stage(4),
    },
    {
      shader: merge,
      resources: { sourceValues: "partials", partials: "total" },
      options: stage(1),
    },
    { shader: statistics },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 256 },
      (_, i) =>
        (controls.mean ?? 100) + (i % 17) * (controls.spread ?? 0.25) + seed,
    ),
    records: new Float32Array(1024),
    partials: new Float32Array(16),
    total: new Float32Array(4),
    result: new Float32Array(3),
  };
}

export async function setup(canvas, device) {
  const stages = createPlan();
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  let seed = 0,
    previous = "",
    input;
  const inspector = createValueInspector(3);
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
        columns: 3,
        scale: controls.gain ?? 1,
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
        "Left to right: mean, variance and standard deviation. Each uses a compressed scale so spread changes remain visible; hover for the actual values." +
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
  id: "variance",
  title: "Stable mean and variance",
  description:
    "Workgroups merge Welford/Chan moment records, avoiding subtraction of two large squared sums. Three output cells show mean, variance and deviation.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["mean", "Baseline", 0, 200, 5, 100],
    ["spread", "Input spread", 0.05, 2, 0.05, 0.25],
    ["viewMode", "View", 0, 1, 1, 0, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
