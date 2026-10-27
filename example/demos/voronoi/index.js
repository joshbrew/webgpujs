// Animated Voronoi
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { voronoi } from "./shaders.js";

const demoDefinition = {
  id: "voronoi",
  title: "Animated Voronoi",
  description: "A 3×3 neighbour search finds the nearest animated cell seed.",
  shader: voronoi,
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
