// Raymarched torus
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { torusMarch } from "./shaders.js";

const demoDefinition = {
  id: "torus",
  title: "Raymarched torus",
  description:
    "Sphere tracing evaluates a signed-distance field with an animated 3D rotation.",
  shader: torusMarch,
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
