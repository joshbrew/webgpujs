// Hilbert FIR envelope detection: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { envelope, display } from "./shaders.js";

function createPlan() {
  return [{ shader: envelope }];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 256 },
      (_, i) =>
        (0.5 + 0.3 * Math.cos((2 * Math.PI * 3 * i) / 256)) *
        Math.sin((2 * Math.PI * (controls.carrier ?? 32) * i) / 256 + seed),
    ),
    quadrature: new Float32Array(256),
    result: new Float32Array(256),
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
    await displayPipeline.render({ inputs: {} });
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
        "An odd-symmetric finite impulse response approximates quadrature phase. The analytic magnitude follows an amplitude-modulated carrier. Cyan: carrier. Gold: envelope." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "hilbert-envelope",
  title: "Hilbert FIR envelope detection",
  description:
    "An odd-symmetric finite impulse response approximates quadrature phase. The analytic magnitude follows an amplitude-modulated carrier. Cyan: carrier. Gold: envelope.",
  category: "Signal processing",
  algorithm: true,
  controls: [["carrier", "Carrier frequency (bins)", 16, 72, 1, 32]],
  legend: [
    ["#4dd8ff", "Carrier signal"],
    ["#ffb840", "Envelope magnitude"],
  ],
  setup,
};
