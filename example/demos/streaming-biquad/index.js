// 256 channels, 512 Hz sampling, continuous 128-sample blocks with retained filter state.
import { WebGPUjs } from "../../../src/pipeline";
import { generate, biquad, display } from "./shaders.js";

// Normalized RBJ biquad coefficients: https://www.w3.org/TR/audio-eq-cookbook/
export function coefficients(type, frequency, q, sampleRate = 512) {
  const omega = (2 * Math.PI * frequency) / sampleRate,
    c = Math.cos(omega),
    alpha = Math.sin(omega) / (2 * q),
    a0 = 1 + alpha;
  let b0 = 1,
    b1 = -2 * c,
    b2 = 1;
  if (type === "lowpass") {
    b0 = (1 - c) / 2;
    b1 = 1 - c;
    b2 = b0;
  }
  if (type === "highpass") {
    b0 = (1 + c) / 2;
    b1 = -(1 + c);
    b2 = b0;
  }
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: (-2 * c) / a0,
    a2: (1 - alpha) / a0,
  };
}

export async function setup(canvas, device) {
  const channels = 256,
    sampleCount = 128,
    sampleRate = 512,
    length = channels * sampleCount;
  const filters = [
    coefficients("notch", 60, 30),
    coefficients("highpass", 3, Math.SQRT1_2),
    coefficients("lowpass", 45, Math.SQRT1_2),
  ];
  const chain = await WebGPUjs.createComputeChain(
    [
      { shader: generate, inputs: { sampleCount, sampleRate } },
      ...filters.map((inputs, index) => ({
        shader: biquad,
        resources: {
          source: ["signal", "notched", "highpassed"][index],
          result: ["notched", "highpassed", "filtered"][index],
          state: "state-" + index,
        },
        inputs: { sampleCount, ...inputs },
        options: { computePass: { workgroupsX: 4 } },
      })),
    ],
    { device },
  );
  const allocations = () => ({
    signal: new Float32Array(length),
    notched: new Float32Array(length),
    highpassed: new Float32Array(length),
    filtered: new Float32Array(length),
    "state-0": new Float32Array(channels * 2),
    "state-1": new Float32Array(channels * 2),
    "state-2": new Float32Array(channels * 2),
  });
  await chain.run({ ...allocations(), blockIndex: 0, hum: 0.8 });
  const displayPipeline = await WebGPUjs.combineShaders(
    display,
    {
      canvas,
      resourceBindings: {
        original: { resource: "signal" },
        notched: { resource: "notched" },
        filtered: { resource: "filtered" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  let blockIndex = 0,
    last = 0,
    hum = 0.8,
    drawKey = "",
    restart = false;
  async function frame(time = 0, controls = {}) {
    const nextHum = controls.hum ?? 0.8;
    if (restart) {
      blockIndex = 0;
      last = time;
      await chain.run({ ...allocations(), blockIndex, hum: nextHum });
      restart = false;
    } else if (time - last >= 250 || nextHum !== hum) {
      last = time;
      blockIndex++;
      await chain.run({ blockIndex, hum: nextHum });
    }
    hum = nextHum;
    const channel = Math.max(
        0,
        Math.min(255, Math.round(controls.channel ?? 1) - 1),
      ),
      key = blockIndex + ":" + channel;
    if (key === drawKey) return;
    drawKey = key;
    await displayPipeline.render({ inputs: { sampleCount, channel } });
  }
  return {
    pipelines: [...chain.passes, displayPipeline],
    chain,
    frame,
    filters,
    sampleCount,
    channels,
    reset() {
      restart = true;
      drawKey = "";
    },
    get resultInfo() {
      return `256 independent channels × 128 samples · 512 Hz sampling · block ${blockIndex}.\nCyan: input. Gold: 60 Hz notch. Green: notch → 3 Hz high-pass → 45 Hz low-pass.\nEach channel retains two state values per biquad between blocks. These are causal IIR sections, not periodic FFT masks.`;
    },
  };
}
export default {
  id: "streaming-biquad",
  title: "Streaming multichannel IIR filters",
  description:
    "A 60 Hz notch and 3–45 Hz bandpass process 256 sampled channels with persistent per-channel state across blocks. One invocation owns each channel; channels run in parallel.",
  category: "Signal processing",
  algorithm: true,
  controls: [
    ["channel", "Channel", 1, 256, 1, 1],
    ["hum", "60 Hz interference", 0, 1.5, 0.05, 0.8],
  ],
  legend: [
    ["#4dd8ff", "Raw signal"],
    ["#ffb840", "60 Hz notch"],
    ["#4dffa5", "3–45 Hz bandpass"],
  ],
  setup,
};
