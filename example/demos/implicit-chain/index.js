// Implicit compute chain
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { scaleSamples, offsetSamples } from "./shaders.js";

const demoDefinition = {
  id: "implicit-chain",
  title: "Implicit compute chain",
  description:
    "Two compute helpers share a buffer by name, even when their argument order changes.",
};

async function implicitChain(device) {
  const first = await WebGPUjs.createPipeline(scaleSamples, { device });
  const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  await first.process(input, 2);
  const second = await WebGPUjs.combineShaders(offsetSamples, {}, first);
  // samples moves from argument 0 to argument 1. Omit it to reuse the GPU allocation.
  const result = await second.process(3);
  return { first, second, input, result };
}

export async function setup(canvas, device, options = {}) {
  const demo = await implicitChain(device);
  return {
    ...demo,
    pipelines: [demo.first, demo.second],
    info: `[${demo.input}] × 2 + 3 = [${demo.result}]`,
    continuous: false,
    async frame() {},
    hostFrameSource:
      "// Both compute passes run once in setup; Rebuild runs them again.",
  };
}

export default { ...demoDefinition, setup };

export { implicitChain };
