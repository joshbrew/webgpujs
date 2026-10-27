// 8×8 DCT image compression: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { forwardDCT, quantize, inverseDCT, display } from "./shaders.js";

function createPlan() {
  return [
    { shader: forwardDCT, inputs: { width: 32 } },
    { shader: quantize },
    { shader: inverseDCT, inputs: { width: 32 } },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 1024 },
      (_, i) =>
        0.5 +
        0.22 *
          Math.sin((i % 32) * 0.37 + seed) *
          Math.cos(Math.floor(i / 32) * 0.51) +
        0.08 * Math.sin(i * 1.7),
    ),
    coefficients: new Float32Array(1024),
    result: new Float32Array(1024),
    quantization: controls.quantization ?? 0.2,
  };
}

export async function setup(canvas, device) {
  const stages = createPlan();
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  let seed = 0,
    previous = "",
    input,
    summary = "";
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
        summary ||
        "Independent blocks transform to cosine coefficients, quantize them, then reconstruct the image. Left: input. Right: compressed reconstruction." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "dct-compression",
  title: "8×8 DCT image compression",
  description:
    "Independent blocks transform to cosine coefficients, quantize them, then reconstruct the image. Left: input. Right: compressed reconstruction.",
  category: "Image processing",
  algorithm: true,
  controls: [["quantization", "Quantization step", 0.05, 1, 0.05, 0.2]],
  setup,
};
