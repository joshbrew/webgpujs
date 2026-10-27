// Atomic histogram → summary → display
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  histogramCompute,
  histogramSummary,
  histogramFragment,
} from "./shaders.js";

const demoDefinition = {
  id: "histogram",
  controls: [["mixture", "Mixture", 0, 1, 0.01, 0.5]],
  title: "Atomic histogram → summary → display",
  description:
    "65,536 invocations atomically count 64 bins. A second pass summarizes them and a fragment shader displays the shared buffer.",
};

async function histogramExample(canvas, device) {
  const histogram = await WebGPUjs.createPipeline(histogramCompute, {
    device,
    resourceBindings: { bins: { resource: "distribution" } },
    computePass: { skipOutputDef: true },
  });
  const summary = await WebGPUjs.combineShaders(
    histogramSummary,
    {
      workGroupSize: 1,
      computePass: { workgroupsX: 1 },
      resourceBindings: { counts: { resource: "distribution" } },
    },
    histogram,
  );
  const display = await WebGPUjs.combineShaders(
    histogramFragment,
    {
      canvas,
      resourceBindings: { histogram: { resource: "distribution" } },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    summary,
  );
  async function update(samples) {
    await histogram.process(samples, new Uint32Array(64));
    const stats = await summary.process(undefined, new Uint32Array(3));
    await display.render({}, undefined, stats[1]);
    return stats;
  }
  return { histogram, summary, display, update };
}

function distributionSamples(count, mix) {
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const gaussian =
      Math.sqrt(-2 * Math.log(Math.max(Math.random(), 0.00001))) *
      Math.cos(2 * Math.PI * Math.random());
    samples[i] = (Math.random() < mix ? 0.3 : 0.7) + gaussian * 0.08;
  }
  return samples;
}

function sourceText(value) {
  return typeof value === "function"
    ? (value.sourceCode ?? value.toString())
    : value;
}

export async function setup(canvas, device, options = {}) {
  const demo = await histogramExample(canvas, device);
  let mixture = 0.5;
  let stats = await demo.update(distributionSamples(65536, mixture));
  async function frame(time, controls = {}) {
    const next = controls.mixture ?? 0.5;
    if (next !== mixture) {
      stats = await demo.update(distributionSamples(65536, next));
      mixture = next;
    }
  }
  return {
    ...demo,
    pipelines: [demo.histogram, demo.summary, demo.display],
    info: `${stats[0]} samples · peak ${stats[1]}`,
    continuous: false,
    frame,
    get resultInfo() {
      return `${stats[0]} samples · peak ${stats[1]}`;
    },
    hostFrameSource: sourceText(demo.update),
  };
}

export default { ...demoDefinition, setup };

export { histogramExample, distributionSamples, sourceText };
