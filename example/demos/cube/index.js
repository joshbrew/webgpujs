// Textured cube
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { cubeVertices, cubeIndices } from "./geometry.js";
import { mat4 } from "wgpu-matrix";
import textureURL from "./knucks.jpg";
import { cubeVertex, cubeFragment } from "./shaders.js";

const demoDefinition = {
  id: "cube",
  title: "Textured cube",
  description:
    "An indexed, textured cube with depth testing and an animated matrix uniform.",
};

export async function setup(canvas, device, options = {}) {
  let image;
  if (typeof createImageBitmap === "function") {
    const response = await fetch(new URL(textureURL, import.meta.url));
    if (!response.ok) throw new Error("Could not load the cube texture");
    const bitmap = await createImageBitmap(await response.blob());
    image = { source: bitmap, width: bitmap.width, height: bitmap.height };
  } else
    image = {
      width: 2,
      height: 2,
      buffer: new Uint8Array([
        255, 80, 80, 255, 80, 255, 80, 255, 80, 80, 255, 255, 255, 255, 255,
        255,
      ]),
    };
  const pipeline = await WebGPUjs.createPipeline(
    { vertex: cubeVertex, fragment: cubeFragment },
    {
      device,
      canvas,
      renderPass: {
        vbos: [{ vertex: "vec4f", color: "vec4f", uv: "vec2f" }],
        indexBuffer: cubeIndices,
        indexFormat: "uint16",
        textures: { image },
      },
      renderPipelineDescriptor: {
        multisample: { count: 4 },
        primitive: { topology: "triangle-list", cullMode: "back" },
      },
    },
  );
  image.source?.close();
  pipeline.fragment.updateVBO(cubeVertices);
  const projection = mat4.perspective(
    (2 * Math.PI) / 5,
    canvas.width / canvas.height,
    0.1,
    100,
  );
  async function frame(time) {
    const view = mat4.translation([0, 0, -5]);
    mat4.rotate(
      view,
      [Math.sin(time / 2500), Math.cos(time / 2500), 0],
      1,
      view,
    );
    await pipeline.render({}, mat4.multiply(projection, view));
  }
  return { pipelines: [pipeline], frame };
}

export default { ...demoDefinition, setup };
