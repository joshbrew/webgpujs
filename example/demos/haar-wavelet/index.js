// Haar wavelet denoising: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { haar, thresholdDetails, display } from "./shaders.js";

function createPlan() {
  const pass = (source, target, axis, inverse) => ({
    shader: haar,
    resources: { state: source, next: target },
    inputs: { width: 32, height: 32, axis, inverse },
  });
  return [
    pass("input", "A", 0, 0),
    pass("A", "coefficients", 1, 0),
    {
      shader: thresholdDetails,
      resources: { state: "coefficients" },
      inputs: { width: 32, height: 32 },
    },
    pass("coefficients", "B", 1, 1),
    pass("B", "result", 0, 1),
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 1024 },
      (_, i) =>
        0.5 +
        0.25 * Math.sin((i % 32) * 0.25) * Math.cos(Math.floor(i / 32) * 0.3) +
        0.12 * Math.sin(i * 2.4 + seed),
    ),
    A: new Float32Array(1024),
    B: new Float32Array(1024),
    coefficients: new Float32Array(1024),
    result: new Float32Array(1024),
    threshold: controls.threshold ?? 0.12,
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
        "Separable row/column Haar transforms isolate detail bands. Thresholding removes small details before the inverse passes reconstruct the image." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "haar-wavelet",
  title: "Haar wavelet denoising",
  description:
    "Separable row/column Haar transforms isolate detail bands. Thresholding removes small details before the inverse passes reconstruct the image.",
  category: "Signal processing",
  algorithm: true,
  controls: [["threshold", "Detail threshold", 0, 0.5, 0.01, 0.12]],
  setup,
};
