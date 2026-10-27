import { consumePointerPress } from "../../shared/controls.js";
// Template cross-correlation
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { correlationView, correlate } from "./shaders.js";

const demoDefinition = {
  id: "correlation",
  controls: [
    ["noise", "Noise amplitude", 0, 3, 0.1, 0.3],
    ["offset", "Planted sample offset", 0, 224, 1, 80],
  ],
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Click or drag horizontally to move the planted template through the signal.",
  title: "Template cross-correlation",
  description:
    "Each invocation scores one signal offset against a 32-sample template to find a planted pattern in noise.",
  mode: "correlation",
  category: "Parallel algorithms",
  algorithm: true,
};

function createPlan() {
  return {
    stages: [
      {
        shader: correlate,
        resources: {
          signalData: "signal",
          templateData: "template",
          result: "correlation",
        },
      },
    ],
    read: ["correlation"],
    view: "correlation",
    width: 16,
  };
}

function createInputs(controls = {}, seed = 0) {
  const noise = (i) => {
    const v = Math.sin((i + seed * 17) * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  {
    const template = Float32Array.from(
      { length: 32 },
      (_, i) => Math.sin(i * 0.7) * Math.sin((Math.PI * i) / 31),
    );
    const signal = Float32Array.from(
      { length: 256 },
      (_, i) => (noise(i) - 0.5) * (controls.noise ?? 0.3),
    );
    for (let i = 0; i < 32; i++)
      signal[Math.round(controls.offset ?? 80) + i] += template[i];
    return { signal, template, correlation: new Float32Array(256) };
  }
}

export async function setup(canvas, device, options = {}) {
  const definition = { ...demoDefinition, ...options };
  const plan = createPlan();
  const chain = await WebGPUjs.createComputeChain(plan.stages, { device });
  let seed = 0,
    previous = "",
    inputs,
    results,
    summary = "";
  await chain.run(createInputs());
  const display = await WebGPUjs.combineShaders(
    correlationView,
    {
      canvas,
      resourceBindings: {
        values: { resource: plan.view },
        signal: { resource: "signal" },
        pattern: { resource: "template" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  let draggedOffset,
    lastSlider = 80,
    hover = -1,
    bestLag = 80;
  async function frame(time, controls = {}) {
    if ((controls.offset ?? 80) !== lastSlider) {
      lastSlider = controls.offset ?? 80;
      draggedOffset = undefined;
    }
    if (consumePointerPress(controls) && controls.pointer)
      draggedOffset = Math.round(
        Math.max(0, Math.min(1, controls.pointer[0])) * 224,
      );
    const offset = draggedOffset ?? lastSlider;
    controls.offset = offset;
    const key = JSON.stringify([controls.noise, offset, seed]);
    if (key !== previous) {
      inputs = createInputs({ ...controls, offset }, seed);
      results = await chain.run(inputs, { readback: plan.read });
      previous = key;

      bestLag = results.correlation.indexOf(Math.max(...results.correlation));
      summary = `Top: cyan noisy signal; gold template planted at sample ${offset}. Bottom: normalized correlation versus lag. Yellow marker: detected peak ${bestLag} (score ${results.correlation[bestLag].toFixed(3)}).`;
    }
    hover = controls.pointer
      ? Math.min(255, Math.max(0, Math.floor(controls.pointer[0] * 256)))
      : -1;
    await display.render({
      inputs: { bestLag, plantedLag: offset, hoverIndex: hover },
    });
  }
  return {
    pipelines: [...chain.passes, display],
    chain,
    frame,
    continuous: false,
    reset() {
      seed++;
      previous = "";
      draggedOffset = undefined;
    },
    get results() {
      return results;
    },
    get input() {
      return inputs;
    },
    get resultInfo() {
      return (
        summary +
        (hover < 0
          ? ""
          : `\nLag ${hover}: correlation ${results.correlation[hover].toFixed(4)}`)
      );
    },
    info: "Adjust the controls or regenerate the data. Only final results are read back; intermediate passes share GPU allocations.",
  };
}

export default {
  ...demoDefinition,
  setup,
  legend: [
    ["#4dd8ff", "Signal"],
    ["#ffb840", "Planted template"],
    ["#4dffa5", "Correlation curve"],
  ],
};

export { createPlan, createInputs };
