// Histogram → CDF → image equalization: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import {
  clear,
  histogram,
  snapshot,
  scan,
  firstCount,
  equalize,
  display,
} from "./shaders.js";

function createPlan() {
  const stages = [
    { shader: clear },
    { shader: histogram },
    { shader: snapshot, resources: { counts: "cdf-A" } },
  ];
  let current = "cdf-A";
  for (let offset = 1; offset < 256; offset *= 2) {
    const next = current === "cdf-A" ? "cdf-B" : "cdf-A";
    stages.push({
      shader: scan,
      resources: { state: current, next },
      inputs: { offset },
    });
    current = next;
  }
  return [
    ...stages,
    { shader: firstCount, resources: { cdf: current } },
    { shader: equalize, resources: { cdf: current } },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    input: Float32Array.from(
      { length: 4096 },
      (_, i) =>
        0.5 +
        (controls.contrast ?? 0.2) *
          (0.3 *
            Math.sin((i % 64) * 0.15 + seed) *
            Math.cos(Math.floor(i / 64) * 0.16) +
            0.1 * Math.sin(i * 0.71)),
    ),
    bins: new Uint32Array(256),
    "cdf-A": new Uint32Array(256),
    "cdf-B": new Uint32Array(256),
    minimum: new Uint32Array(1),
    result: new Float32Array(4096),
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
        "Atomic counting and eight parallel scan passes build a cumulative histogram. A lookup remaps low-contrast image samples. Left: source. Right: equalized output." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "histogram-equalization",
  title: "Histogram → CDF → image equalization",
  description:
    "Atomic counting and eight parallel scan passes build a cumulative histogram. A lookup remaps low-contrast image samples. Left: source. Right: equalized output.",
  category: "Image processing",
  algorithm: true,
  controls: [["contrast", "Source contrast", 0.05, 1, 0.05, 0.2]],
  setup,
};
