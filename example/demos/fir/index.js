// FIR smoothing → gain
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { firPass, nativeGain, signalDisplay } from "./shaders.js";

const demoDefinition = {
  id: "fir",
  controls: [
    ["frequency", "Signal frequency (bins)", 1, 40, 0.25, 7],
    ["noise", "High-frequency amplitude", 0, 0.8, 0.05, 0.3],
    ["radius", "Filter radius", 1, 20, 1, 5],
    ["gain", "Output gain", 0.1, 2, 0.05, 1],
  ],
  title: "FIR smoothing → gain",
  description:
    "A JavaScript FIR filter feeds a native WGSL gain stage. A resource alias connects filtered to samples, with only the final signal read back.",
  mode: "fir",
  category: "Signal processing",
};

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
  stages = [
    {
      shader: firPass,
      resources: { signalData: "signal", filtered: "result" },
    },
    { shader: nativeGain, resources: { samples: "result" } },
  ];
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
    ...{ radius: 5, gain: 1 },
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
      Object.assign(inputs, { radius: settings.radius, gain: settings.gain });

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

export { signalSamples };
