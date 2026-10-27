// Polar kaleidoscope
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { kaleidoscope } from "./shaders.js";

const demoDefinition = {
  id: "kaleidoscope",
  title: "Polar kaleidoscope",
  description: "Angular folding and radial waves form ten-fold symmetry.",
  shader: kaleidoscope,
  category: "Fragment studies",
};

export async function setup(canvas, device, options = {}) {
  const definition = { ...demoDefinition, ...options };
  const pipeline = await WebGPUjs.createPipeline(definition.shader, {
    device,
    canvas,
    renderPass: { vbos: [], vertexCount: 3 },
  });
  async function frame(time, controls = {}) {
    if (definition.interactive)
      await pipeline.render(
        {},
        time / 1000,
        controls.zoom ?? 1,
        controls.pointer ?? [0, 0],
      );
    else await pipeline.render({}, time / 1000);
  }
  return { pipelines: [pipeline], frame };
}

export default { ...demoDefinition, setup };
