// 256 channels · notch + bandpass
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  channelFilterDisplay,
  synthesizeChannels,
  packComplex,
  notchSpectrum,
  bandpassSpectrum,
  unpackReal,
  reverseFFTAxis,
  fftAxisButterfly,
} from "./shaders.js";

const demoDefinition = {
  id: "batch-fft",
  controls: [
    ["channel", "Channel", 1, 256, 1, 1],
    ["hum", "60 Hz interference", 0, 1.5, 0.05, 0.8],
    ["notchHz", "Notch center (Hz)", 45, 65, 0.5, 60],
    ["notchWidth", "Notch width (Hz)", 1, 10, 0.5, 2],
    ["lowHz", "Bandpass low (Hz)", 0, 15, 0.5, 3],
    ["highHz", "Bandpass high (Hz)", 20, 100, 1, 45],
  ],
  title: "256 channels · notch + bandpass",
  category: "Signal processing",
  description:
    "256 signals sampled at 512 Hz share batched FFT passes, a 60 Hz notch and a 3–45 Hz bandpass. Inspect any channel and the full channel grid.",
  channelCount: 256,
  canvasSize: [1024, 768],
  sampleCount: 1024,
  sampleRate: 512,
};

function channelFilterPlan(sampleCount = 1024, sampleRate = 512) {
  const forward = fftAxisStages(sampleCount, "fft-A");
  const stages = [
    {
      shader: synthesizeChannels,
      resources: { signalData: "signal" },
      inputs: { sampleCount, sampleRate },
    },
    {
      shader: packComplex,
      resources: { signalData: "signal", next: "fft-A" },
    },
    ...forward.stages,
    {
      shader: notchSpectrum,
      resources: {
        state: forward.current,
        spectrum: "spectrum",
        notched: "notch-spectrum",
      },
      inputs: { sampleCount, sampleRate },
    },
    {
      shader: bandpassSpectrum,
      resources: { state: "notch-spectrum", next: "band-spectrum" },
      inputs: { sampleCount, sampleRate },
    },
  ];
  for (const [spectrum, result] of [
    ["notch-spectrum", "notched"],
    ["band-spectrum", "filtered"],
  ]) {
    const inverse = fftAxisStages(sampleCount, spectrum, 1, 1);
    stages.push(...inverse.stages, {
      shader: unpackReal,
      resources: { state: inverse.current, result },
      inputs: { normalization: sampleCount },
    });
  }
  return stages;
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
  const channelCount = definition.channelCount ?? 256;
  const sampleCount = definition.sampleCount ?? 1024;
  const sampleRate = definition.sampleRate ?? 512;
  const length = channelCount * sampleCount;
  const chain = await WebGPUjs.createComputeChain(
    channelFilterPlan(sampleCount, sampleRate),
    { device },
  );
  const allocations = Object.fromEntries([
    ...["signal", "notched", "filtered"].map((name) => [
      name,
      new Float32Array(length),
    ]),
    ...["fft-A", "fft-B", "spectrum", "notch-spectrum", "band-spectrum"].map(
      (name) => [name, new Float32Array(length * 2)],
    ),
  ]);
  const defaults = {
    hum: 0.8,
    notchHz: 60,
    notchWidth: 2,
    lowHz: 3,
    highHz: 45,
  };
  await chain.run({ ...allocations, ...defaults });
  const display = await WebGPUjs.combineShaders(
    channelFilterDisplay,
    {
      canvas,
      resourceBindings: {
        original: { resource: "signal" },
        notched: { resource: "notched" },
        filtered: { resource: "filtered" },
        spectrum: { resource: "spectrum" },
        notchBins: { resource: "notch-spectrum" },
        bandBins: { resource: "band-spectrum" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  let previous = JSON.stringify(defaults),
    summary = "";
  async function frame(time, controls = {}) {
    const settings = Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        controls[key] ?? value,
      ]),
    );
    const key = JSON.stringify(settings);
    if (key !== previous) {
      await chain.run(settings); // No intermediate or final CPU readback.
      previous = key;
    }
    const channel = Math.max(
      0,
      Math.min(channelCount - 1, Math.round(controls.channel ?? 1) - 1),
    );
    await display.render({
      inputs: {
        sampleCount,
        sampleRate,
        channelCount,
        selectedChannel: channel,
      },
    });
    summary = `${channelCount} independent channels × ${sampleCount} samples · ${sampleRate} Hz sampling · ${sampleCount / sampleRate} s blocks · ${sampleRate / sampleCount} Hz/bin.\nChannel ${channel + 1}: cyan original, gold notch-only, green notch + ${settings.lowHz}–${settings.highHz} Hz bandpass.\nMiddle: overlaid 0–100 Hz spectra; marker at 60 Hz. Bottom: all ${channelCount} filtered channels.\n${settings.notchHz} Hz notch, ${settings.notchWidth} Hz full width. Rectangular frequency masks on periodic blocks; no streaming filter state. Display reads GPU buffers directly.`;
  }
  return {
    chain,
    pipelines: [...chain.passes, display],
    frame,
    continuous: false,
    info: "256 channels sampled at 512 Hz. Top: original / notch-only / bandpassed. Middle: spectra. Bottom: all channels.",
    get resultInfo() {
      return summary;
    },
  };
}

export default { ...demoDefinition, setup };

export { channelFilterPlan, fftAxisStages };
