// Fourier transform
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { dft } from "./shaders.js";

const demoDefinition = {
  id: "dft",
  title: "Fourier transform",
  description:
    "A compute shader transforms 64 real samples into complex frequency bins, then reads back the result.",
};

export async function setup(canvas, device, options = {}) {
  const pipeline = await WebGPUjs.createPipeline(dft, { device });
  const input = new Float32Array(64).fill(1);
  const output = await pipeline.process(input, new Float32Array(128));
  return {
    pipelines: [pipeline],
    output,
    info: `DFT output (real / imaginary pairs):\n${Array.from(output)
      .map((v) => v.toFixed(3))
      .join(", ")}`,
    continuous: false,
    async frame() {},
  };
}

export default { ...demoDefinition, setup };
