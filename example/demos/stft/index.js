// Windowed FFT spectrogram: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import {
  packComplex,
  unpackReal,
  reverseFFTAxis,
  fftAxisButterfly,
  windows,
  magnitude,
  display,
} from "./shaders.js";

function fftAxisStages(axisLength, initial, stride = 1, direction = -1) {
  if (
    !Number.isInteger(axisLength) ||
    axisLength < 2 ||
    axisLength & (axisLength - 1)
  )
    throw new Error("FFT axes must have power-of-two lengths of at least two");
  const stages = [];
  let current = initial;
  function append(shader, inputs) {
    const next = current === "fft-A" ? "fft-B" : "fft-A";
    stages.push({ shader, resources: { state: current, next }, inputs });
    current = next;
  }
  append(reverseFFTAxis, { axisLength, stride });
  for (let span = 2; span <= axisLength; span *= 2)
    append(fftAxisButterfly, { axisLength, stride, span, direction });
  return { stages, current };
}
function createPlan() {
  const fft = fftAxisStages(128, "fft-A");
  return [
    {
      shader: windows,
      resources: { signalData: "signal", next: "fft-A" },
      inputs: { count: 128, hop: 32 },
      options: { computePass: { workgroupsX: 32 } },
    },
    ...fft.stages,
    {
      shader: magnitude,
      resources: { state: fft.current },
      inputs: { count: 128, frames: 16 },
    },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    signal: Float32Array.from({ length: 608 }, (_, i) => {
      const t = i / 256;
      return (
        Math.sin(2 * Math.PI * ((controls.start ?? 8) * t + 12 * t * t)) +
        0.35 * Math.sin(2 * Math.PI * 60 * t)
      );
    }),
    "fft-A": new Float32Array(4096),
    "fft-B": new Float32Array(4096),
    result: new Float32Array(1024),
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
    await displayPipeline.render({ inputs: { columns: 16, scale: 1 } });
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
        "Sixteen overlapping Hann windows share a batched radix-2 FFT. Time runs left to right, frequency runs bottom to top." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "stft",
  title: "Windowed FFT spectrogram",
  description:
    "Sixteen overlapping Hann windows share a batched radix-2 FFT. Time runs left to right, frequency runs bottom to top.",
  category: "Signal processing",
  algorithm: true,
  controls: [["start", "Start frequency (Hz)", 4, 30, 1, 8]],
  legend: [
    ["#315acd", "Time → (0.125 s / frame)"],
    ["#ffce4a", "Frequency ↑ (0–126 Hz)"],
  ],
  setup,
};
