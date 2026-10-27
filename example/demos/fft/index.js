// Radix-2 FFT analyzer
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  prepareSignal,
  spectrumPass,
  signalDisplay,
  fftPass,
} from "./shaders.js";

const demoDefinition = {
  id: "fft",
  controls: [
    ["frequency", "Signal frequency (bins)", 1, 40, 0.25, 7],
    ["noise", "High-frequency amplitude", 0, 0.8, 0.05, 0.3],
    ["window", "Hann window", 0, 1, 1, 1],
  ],
  title: "Radix-2 FFT analyzer",
  description:
    "Bit reversal and eight butterfly passes transform 256 samples. Compare a Hann window with a rectangular window and adjust the input frequencies.",
  mode: "fft",
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
    stages.push({
      shader: spectrumPass,
      resources: { state: fft.current, result: "result" },
      inputs: { count },
    });
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
    ...{ windowMix: 1 },
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
        windowMix: settings.window,
      });

      latest = await chain.run(inputs, { readback: "result" });
      previous = key;
    }
    await display.render({
      inputs: { spectrum: 1 },
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
    info: "Cyan: input waveform. Gold: frequency magnitudes. 256 samples · 8 radix-2 butterfly passes.",
  };
}

export default { ...demoDefinition, setup };

export { fftStages, signalSamples };
