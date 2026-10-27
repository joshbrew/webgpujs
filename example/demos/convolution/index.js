// Storage-buffer image convolution: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { convolve, display } from "./shaders.js";

function createPlan() {
  return [{ shader: convolve, inputs: { width: 32, height: 32 } }];
}
function createInputs(controls = {}, seed = 0) {
  const amount = controls.strength ?? 1;
  return {
    input: Float32Array.from(
      { length: 1024 },
      (_, i) =>
        0.5 +
        0.22 *
          Math.sin((i % 32) * 0.55 + seed) *
          Math.cos(Math.floor(i / 32) * 0.43),
    ),
    kernel: new Float32Array([
      0,
      -amount,
      0,
      -amount,
      1 + 4 * amount,
      -amount,
      0,
      -amount,
      0,
    ]),
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
        "A 3×3 sharpening kernel gathers neighboring samples from a storage array. Left: source image. Right: convolved result." +
        "\n" +
        stages.length +
        " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "convolution",
  title: "Storage-buffer image convolution",
  description:
    "A 3×3 sharpening kernel gathers neighboring samples from a storage array. Left: source image. Right: convolved result.",
  category: "Image processing",
  algorithm: true,
  controls: [["strength", "Sharpening", 0, 2, 0.1, 1]],
  setup,
};
