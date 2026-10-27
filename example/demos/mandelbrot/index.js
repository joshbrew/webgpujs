// Mandelbrot
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { mandelbrot } from "./shaders.js";

const demoDefinition = {
  id: "mandelbrot",
  controls: [["zoom", "Zoom", 1, 15, 0.05, 1]],
  title: "Mandelbrot",
  description:
    "A fragment-only pipeline with an automatic fullscreen vertex shader and a zoom control.",
};

export async function setup(canvas, device, options = {}) {
  const pipeline = await WebGPUjs.createPipeline(mandelbrot, {
    device,
    canvas,
    renderPass: { vbos: [], vertexCount: 3 },
  });
  async function frame(time, controls = {}) {
    await pipeline.render({}, controls.zoom ?? 1, [-0.5, 0]);
  }
  return { pipelines: [pipeline], frame, continuous: false };
}

export default { ...demoDefinition, setup };
