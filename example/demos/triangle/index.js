// Triangle
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { triangleVertex, colorFragment } from "./shaders.js";

const demoDefinition = {
  id: "triangle",
  title: "Triangle",
  description:
    "Vertex and fragment shaders pass interpolated colour between three vertices.",
};

export async function setup(canvas, device, options = {}) {
  const pipeline = await WebGPUjs.createPipeline(
    { vertex: triangleVertex, fragment: colorFragment },
    {
      device,
      canvas,
      renderPass: { vbos: [{ color: "vec4f" }], vertexCount: 3 },
    },
  );
  async function frame() {
    await pipeline.render();
  }
  return { pipelines: [pipeline], frame, continuous: false };
}

export default { ...demoDefinition, setup };
