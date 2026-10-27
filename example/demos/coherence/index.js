// Magnitude-squared spectral coherence: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { spectralMoments, coherence, display } from "./shaders.js";

function createPlan() {
  return [
    { shader: spectralMoments, inputs: { count: 128, bins: 64 } },
    { shader: coherence, inputs: { bins: 64, trials: 8 } },
  ];
}
function createInputs(controls = {}, seed = 0) {
  const noise = (i) => {
    const v = Math.sin(i * 12.9898 + seed * 4.3) * 43758.5453;
    return v - Math.floor(v) - 0.5;
  };
  return {
    left: Float32Array.from(
      { length: 1024 },
      (_, i) => Math.sin((2 * Math.PI * 10 * (i % 128)) / 128) + noise(i) * 0.8,
    ),
    right: Float32Array.from(
      { length: 1024 },
      (_, i) =>
        (controls.relationship ?? 0.7) *
          Math.sin((2 * Math.PI * 10 * (i % 128)) / 128 + 0.4) +
        0.6 *
          Math.sin(
            (2 * Math.PI * 23 * (i % 128)) / 128 + Math.floor(i / 128) * 0.9,
          ) +
        noise(i + 2077) * 0.8,
    ),
    moments: new Float32Array(512 * 4),
    result: new Float32Array(64),
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
      resourceBindings: { values: { resource: resultName } },
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
        "Cross-power and auto-power spectra are averaged across eight windows. The normalized result identifies frequencies shared by two noisy signals." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "coherence",
  title: "Magnitude-squared spectral coherence",
  description:
    "Cross-power and auto-power spectra are averaged across eight windows. The normalized result identifies frequencies shared by two noisy signals.",
  category: "Signal processing",
  algorithm: true,
  controls: [["relationship", "Shared component", 0, 1, 0.05, 0.7]],
  legend: [
    ["#4adfbb", "Frequency bin → (0–63)"],
    ["#bdd6ef", "Coherence: 0–1"],
  ],
  setup,
};
