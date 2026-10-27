// Refracted caustics
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { caustics } from "./shaders.js";

const demoDefinition = {
  id: "caustics",
  title: "Refracted caustics",
  description:
    "Iterated coordinate distortions concentrate light into moving underwater ribbons.",
  shader: caustics,
  category: "Interactive shader studies",
  interactive: true,
};

export async function setup(canvas, device, options = {}) {
  const definition = { ...demoDefinition, ...options };
  const pipeline = await WebGPUjs.createPipeline(definition.shader, {
    device,
    canvas,
    renderPass: { vbos: [], vertexCount: 3 },
  });
  async function frame(time, controls = {}) {
    await pipeline.render(
      {},
      time / 1000,
      controls.zoom ?? 1,
      controls.pointer ?? [0, 0],
    );
  }
  return { pipelines: [pipeline], frame };
}

export default {
  ...demoDefinition,
  setup,
  controls: [["zoom", "Zoom", 0.4, 5, 0.05, 1]],
};
