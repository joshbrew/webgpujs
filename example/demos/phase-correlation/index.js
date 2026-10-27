// FFT phase-correlation registration: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import {
  packComplex,
  unpackReal,
  reverseFFTAxis,
  fftAxisButterfly,
  copySpectrum,
  crossPower,
  estimate,
  display,
} from "./shaders.js";

function fft2DStages(width, height, initial, direction = -1) {
  const rows = fftAxisStages(width, initial, 1, direction);
  const columns = fftAxisStages(height, rows.current, width, direction);
  return {
    stages: [...rows.stages, ...columns.stages],
    current: columns.current,
  };
}
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
  const a = fft2DStages(32, 32, "fft-A"),
    b = fft2DStages(32, 32, "fft-A"),
    inverse = fft2DStages(32, 32, "cross", 1);
  return [
    {
      shader: packComplex,
      resources: { signalData: "image-A", next: "fft-A" },
    },
    ...a.stages,
    {
      shader: copySpectrum,
      resources: { state: a.current, next: "spectrum-A" },
    },
    {
      shader: packComplex,
      resources: { signalData: "image-B", next: "fft-A" },
    },
    ...b.stages,
    {
      shader: crossPower,
      resources: { a: "spectrum-A", b: b.current, next: "cross" },
    },
    ...inverse.stages,
    {
      shader: unpackReal,
      resources: { state: inverse.current, result: "result" },
      inputs: { normalization: 1024 },
    },
    {
      shader: estimate,
      resources: { correlation: "result" },
      inputs: { width: 32 },
    },
  ];
}
function createInputs(controls = {}, seed = 0) {
  const a = Float32Array.from({ length: 1024 }, (_, i) => {
      const n = Math.sin(i * 12.9898 + seed) * 43758.5453;
      const x = (i % 32) / 32,
        y = Math.floor(i / 32) / 32;
      return (
        0.08 * (n - Math.floor(n)) +
        0.8 * Math.exp(-((x - 0.3) ** 2 + (y - 0.4) ** 2) / 0.012) +
        0.6 * Math.exp(-((x - 0.67) ** 2 + (y - 0.72) ** 2) / 0.02) +
        (Math.abs(x - 0.72) < 0.025 && y > 0.12 && y < 0.55 ? 0.4 : 0)
      );
    }),
    dx = Math.round(controls.dx ?? 5),
    dy = Math.round(controls.dy ?? -3);
  const b = Float32Array.from(
    { length: 1024 },
    (_, i) =>
      a[
        ((Math.floor(i / 32) - dy + 32) % 32) * 32 + (((i % 32) - dx + 32) % 32)
      ],
  );
  return {
    "image-A": a,
    "image-B": b,
    "fft-A": new Float32Array(2048),
    "fft-B": new Float32Array(2048),
    "spectrum-A": new Float32Array(2048),
    cross: new Float32Array(2048),
    result: new Float32Array(1024),
    shift: new Float32Array(2),
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
        values: { resource: resultName },
        firstImage: { resource: "image-A" },
        movedImage: { resource: "image-B" },
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
      const shift = await chain.read("shift");
      summary =
        "Estimated cyclic translation: " +
        shift[0] +
        " px horizontally, " +
        shift[1] +
        " px vertically. The correlation peak is found on the GPU; only these two numbers are read back. Left: source image. Middle: shifted image. Right: the translation peak (wrapped coordinates).";
      previous = key;
    }
    await displayPipeline.render({ inputs: { columns: 32, scale: 1 } });
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
        "Two 32×32 images transform through row/column FFTs. A normalized cross-power spectrum and inverse FFT reveal their cyclic translation." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "phase-correlation",
  title: "FFT phase-correlation registration",
  description:
    "Two 32×32 images transform through row/column FFTs. A normalized cross-power spectrum and inverse FFT reveal their cyclic translation.",
  category: "Signal processing",
  algorithm: true,
  controls: [
    ["dx", "Horizontal shift", -12, 12, 1, 5],
    ["dy", "Vertical shift", -12, 12, 1, -3],
  ],
  legend: [
    ["#bbb", "Left: source"],
    ["#ddd", "Middle: translated"],
    ["#ffba40", "Right: shift peak"],
  ],
  setup,
};
