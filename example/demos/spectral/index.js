// FFT → filter → inverse FFT
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  prepareSignal,
  lowPassBins,
  reverseComplex,
  realSignal,
  signalDisplay,
  fftPass,
} from "./shaders.js";

const demoDefinition = {
  id: "spectral",
  controls: [
    ["frequency", "Signal frequency (bins)", 1, 40, 0.25, 7],
    ["noise", "High-frequency amplitude", 0, 0.8, 0.05, 0.3],
    ["cutoff", "Low-pass cutoff (bins)", 1, 90, 1, 18],
  ],
  title: "FFT → filter → inverse FFT",
  description:
    "A pluggable compute chain removes high-frequency bins, then reconstructs the signal with an inverse FFT. All intermediate arrays remain on the GPU.",
  mode: "spectral",
  category: "Signal processing",
};

function fftStages(count, initial = "complex-A", direction = -1) {
  if (!Number.isInteger(count) || count < 2 || count & (count - 1))
    throw new Error("FFT size must be a power of two");
  const stages = [];
  let current = initial;
  for (let span = 2; span <= count; span *= 2) {
    const next = current === "complex-A" ? "complex-B" : "complex-A";
    stages.push({
      shader: fftPass,
      resources: { state: current, next },
      inputs: { span, direction },
    });
    current = next;
  }
  return { stages, current };
}

function signalSamples(count, frequency = 7, noise = 0.3) {
  return Float32Array.from(
    { length: count },
    (_, i) =>
      Math.sin((2 * Math.PI * frequency * i) / count) * 0.6 +
      Math.sin((2 * Math.PI * 53 * i) / count) * noise,
  );
}

export async function setup(canvas, device, options = {}) {
  const count = 256;
  let stages, fft;
  {
    fft = fftStages(count);
    stages = [
      {
        shader: prepareSignal,
        resources: { signalData: "signal", complex: "complex-A" },
        inputs: { count },
      },
      ...fft.stages,
    ];
    {
      const reversed = fft.current === "complex-A" ? "complex-B" : "complex-A";
      const inverse = fftStages(count, reversed, 1);
      stages.push(
        { shader: lowPassBins, resources: { state: fft.current } },
        {
          shader: reverseComplex,
          resources: { state: fft.current, next: reversed },
          inputs: { count },
        },
        ...inverse.stages,
        {
          shader: realSignal,
          resources: { state: inverse.current, result: "result" },
          inputs: { count },
        },
      );
    }
  }
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  const allocations = {
    signal: signalSamples(count),
    result: new Float32Array(count),
  };
  if (fft)
    Object.assign(allocations, {
      "complex-A": new Float32Array(count * 2),
      "complex-B": new Float32Array(count * 2),
    });
  await chain.run({
    ...allocations,
    ...{ windowMix: 0, cutoff: 18 },
  });
  const display = await WebGPUjs.combineShaders(
    signalDisplay,
    {
      canvas,
      resourceBindings: {
        original: { resource: "signal" },
        processed: { resource: "result" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  let previous = "",
    latest;
  async function frame(time, controls = {}) {
    const settings = {
      frequency: controls.frequency ?? 7,
      noise: controls.noise ?? 0.3,
      window: controls.window ?? 1,
      cutoff: Math.round(controls.cutoff ?? 18),
      radius: Math.round(controls.radius ?? 5),
      gain: controls.gain ?? 1,
    };
    const key = JSON.stringify(settings);
    if (key !== previous) {
      const inputs = {
        signal: signalSamples(count, settings.frequency, settings.noise),
      };
      Object.assign(inputs, {
        windowMix: 0,
      });
      inputs.cutoff = settings.cutoff;
      latest = await chain.run(inputs, { readback: "result" });
      previous = key;
    }
    await display.render({
      inputs: { spectrum: 0 },
    });
  }
  return {
    pipelines: [...chain.passes, display],
    chain,
    frame,
    continuous: false,
    get result() {
      return latest;
    },
    info: "Cyan: input waveform. Gold: filtered output. Intermediate transforms stay on the GPU; only the final signal is read back.",
  };
}

export default { ...demoDefinition, setup };

export { fftStages, signalSamples };
