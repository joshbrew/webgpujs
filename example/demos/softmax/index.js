import {
  createValueInspector,
  dataControls,
} from "../../shared/value-inspector.js";
// Stable multi-pass softmax: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import {
  reduceMaximum,
  exponentiate,
  reduceSum,
  normalize,
  display,
} from "./shaders.js";

function createPlan() {
  return [
    { shader: reduceMaximum },
    { shader: exponentiate },
    {
      shader: reduceSum,
      resources: { sourceValues: "weights", partials: "partials" },
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
    { shader: normalize },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 256 },
      (_, i) => Math.sin(i * 0.13 + seed) * 6,
    ),
    peak: new Float32Array(1),
    weights: new Float32Array(256),
    partials: new Float32Array(4),
    total: new Float32Array(1),
    result: new Float32Array(256),
    temperature: controls.temperature ?? 1,
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
        scale: 40 * (controls.gain ?? 1),
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
        "Find the maximum, exponentiate shifted logits, reduce the sum and normalize. This avoids overflow while keeping every temporary array on the GPU." +
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
  id: "softmax",
  title: "Stable multi-pass softmax",
  description:
    "Find the maximum, exponentiate shifted logits, reduce the sum and normalize. This avoids overflow while keeping every temporary array on the GPU.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["temperature", "Temperature", 0.2, 3, 0.1, 1],
    ["viewMode", "View", 0, 1, 1, 0, ["Heatmap", "Signed bars"]],
    ["gain", "Color gain", 0.25, 4, 0.25, 1],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change the input controls, or hover the preview to inspect the actual GPU result. Cyan is positive; coral is negative.",
  setup,
};
