// Block FIR overlap-add convolution: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { blockConvolution, addTails, display } from "./shaders.js";

function createPlan() {
  return [
    {
      shader: blockConvolution,
      inputs: { blockSize: 32, outputSize: 48 },
      options: { computePass: { workgroupsX: 6 } },
    },
    { shader: addTails, inputs: { blockSize: 32, outputSize: 48, blocks: 8 } },
  ];
}
function createInputs(controls = {}, seed = 0) {
  const cutoff = controls.cutoff ?? 0.12;
  const taps = Float32Array.from({ length: 17 }, (_, i) => {
    const n = i - 8;
    return (
      (n === 0
        ? 2 * cutoff
        : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n)) *
      (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / 16))
    );
  });
  const total = taps.reduce((a, b) => a + b, 0);
  for (let i = 0; i < taps.length; i++) taps[i] /= total;
  return {
    input: Float32Array.from(
      { length: 256 },
      (_, i) =>
        Math.sin((2 * Math.PI * 8 * i) / 256) +
        0.4 * Math.sin((2 * Math.PI * 73 * i) / 256 + seed),
    ),
    taps,
    partials: new Float32Array(384),
    result: new Float32Array(272),
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
        "Eight blocks convolve independently with a 17-tap windowed-sinc filter, then a second pass adds overlapping tails. Cyan: input. Gold: filtered output, including its tail." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "overlap-add",
  title: "Block FIR overlap-add convolution",
  description:
    "Eight blocks convolve independently with a 17-tap windowed-sinc filter, then a second pass adds overlapping tails. Cyan: input. Gold: filtered output, including its tail.",
  category: "Signal processing",
  algorithm: true,
  controls: [["cutoff", "Normalized cutoff", 0.04, 0.4, 0.01, 0.12]],
  legend: [
    ["#4dd8ff", "Top: input samples"],
    ["#ffb840", "Bottom: FIR output + tail"],
  ],
  setup,
};
