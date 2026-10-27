// 2D FFT → spatial filtering → inverse
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  fftImageDisplay,
  synthesizeFFTImage,
  packComplex,
  lowpassSpectrum2D,
  unpackReal,
  reverseFFTAxis,
  fftAxisButterfly,
} from "./shaders.js";

const demoDefinition = {
  id: "fft-2d",
  controls: [
    ["cutoff", "Low-pass radius (cycles/image)", 0, 64, 1, 12],
    ["stripeFrequency", "Diagonal stripe frequency", 6, 40, 1, 18],
    ["contrast", "Spectrum contrast", 0.2, 3, 0.1, 1],
  ],
  title: "2D FFT → spatial filtering → inverse",
  category: "Signal processing",
  description:
    "A separable 128×128 image FFT transforms rows and columns, applies a radial low-pass mask, then reconstructs the image with an inverse transform.",
  width: 128,
  height: 128,
  canvasSize: [768, 256],
};

function imageFFTPlan(width = 128, height = 128) {
  const forward = fft2DStages(width, height, "fft-A");
  const inverse = fft2DStages(width, height, "filtered-spectrum", 1);
  return [
    {
      shader: synthesizeFFTImage,
      resources: { image: "image" },
      inputs: { width, height },
    },
    {
      shader: packComplex,
      resources: { signalData: "image", next: "fft-A" },
    },
    ...forward.stages,
    {
      shader: lowpassSpectrum2D,
      resources: {
        state: forward.current,
        spectrum: "spectrum",
        next: "filtered-spectrum",
      },
      inputs: { width, height },
    },
    ...inverse.stages,
    {
      shader: unpackReal,
      resources: { state: inverse.current, result: "filtered" },
      inputs: { normalization: width * height },
    },
  ];
}

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

export async function setup(canvas, device, options = {}) {
  const definition = { ...demoDefinition, ...options };
  const width = definition.width ?? 128,
    height = definition.height ?? 128;
  const length = width * height;
  const chain = await WebGPUjs.createComputeChain(imageFFTPlan(width, height), {
    device,
  });
  const allocations = Object.fromEntries([
    ...["image", "filtered"].map((name) => [name, new Float32Array(length)]),
    ...["fft-A", "fft-B", "spectrum", "filtered-spectrum"].map((name) => [
      name,
      new Float32Array(length * 2),
    ]),
  ]);
  const defaults = { stripeFrequency: 18, cutoff: 12 };
  await chain.run({ ...allocations, ...defaults });
  const display = await WebGPUjs.combineShaders(
    fftImageDisplay,
    {
      canvas,
      resourceBindings: {
        original: { resource: "image" },
        spectrum: { resource: "spectrum" },
        filtered: { resource: "filtered" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  let previous = JSON.stringify(defaults),
    summary = "";
  async function frame(time, controls = {}) {
    const settings = {
      stripeFrequency: Math.round(controls.stripeFrequency ?? 18),
      cutoff: controls.cutoff ?? 12,
    };
    const key = JSON.stringify(settings);
    if (key !== previous) {
      await chain.run(settings);
      previous = key;
    }
    await display.render({
      inputs: { width, height, contrast: controls.contrast ?? 1 },
    });
    summary = `${width}×${height} real image → row FFTs → column FFTs → radial low-pass → inverse rows/columns.\nLeft: source. Middle: centered log-magnitude spectrum. Right: reconstructed image.\nCutoff ${settings.cutoff} cycles/image; diagonal stripe frequency ${settings.stripeFrequency}. Inverse normalization: 1 / ${length}. All intermediates and display data stay on GPU.`;
  }
  return {
    chain,
    pipelines: [...chain.passes, display],
    frame,
    continuous: false,
    info: "Left: source image. Middle: shifted 2D FFT magnitude. Right: low-pass inverse FFT.",
    get resultInfo() {
      return summary;
    },
  };
}

export default { ...demoDefinition, setup };

export { imageFFTPlan, fft2DStages, fftAxisStages };
