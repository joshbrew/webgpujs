// Parallel median denoising: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { median, display } from "./shaders.js";

function createPlan() {
  return [{ shader: median, inputs: { width: 32, height: 32 } }];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from({ length: 1024 }, (_, i) =>
      (i * 73 + seed * 11) % 19 === 0
        ? i % 2
          ? 1
          : 0
        : 0.5 +
          0.25 * Math.sin((i % 32) * 0.35) * Math.cos(Math.floor(i / 32) * 0.3),
    ),
    result: new Float32Array(1024),
  };
}

export async function setup(canvas, device) {
  const stages = createPlan();
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  let seed = 0,
    previous = "",
    input;
  const resultName = "result";
  const displayPipeline = await WebGPUjs.combineShaders(
    display,
    {
      canvas,
      resourceBindings: {
        input: { resource: "input" },
        result: { resource: "result" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  async function frame(time, controls = {}) {
    const key = JSON.stringify([controls, seed]);
    if (key !== previous) {
      input = createInputs(controls, seed);
      await chain.run(input);
      previous = key;
    }
    await displayPipeline.render({ inputs: { width: 32, height: 32 } });
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
        "Each invocation sorts a private nine-sample window. Median filtering removes isolated impulse noise without averaging every edge." +
        "\n" +
        stages.length +
        " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "median-filter",
  title: "Parallel median denoising",
  description:
    "Each invocation sorts a private nine-sample window. Median filtering removes isolated impulse noise without averaging every edge.",
  category: "Image processing",
  algorithm: true,
  controls: [],
  setup,
};
