// Sobel edge detection
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  sobelTexture,
  generateTexture,
  textureVertex,
  textureFragment,
} from "./shaders.js";

const demoDefinition = {
  id: "sobel",
  title: "Sobel edge detection",
  description:
    "A compute-generated image flows through a 3×3 gradient kernel and into a sampled-texture render pass.",
  category: "Image processing",
  shader: sobelTexture,
};

export async function setup(canvas, device, options = {}) {
  const definition = { ...demoDefinition, ...options };
  const width = canvas.width,
    height = canvas.height;
  const first = await WebGPUjs.createPipeline(generateTexture, {
    device,
    resourceBindings: { destination: { resource: `${definition.id}-source` } },
    computePass: {
      workgroupsX: Math.ceil(width / 64),
      workgroupsY: height,
      skipOutputDef: true,
    },
    renderPass: {
      textures: { destination: { width, height, isStorage: true } },
    },
  });
  const second = await WebGPUjs.combineShaders(
    {
      compute: definition.shader,
      vertex: textureVertex,
      fragment: textureFragment,
    },
    {
      canvas,
      shaderBindings: {
        compute: {
          source: { resource: `${definition.id}-source` },
          smoothed: { resource: `${definition.id}-output` },
        },
        fragment: { displayImage: { resource: `${definition.id}-output` } },
      },
      computePass: {
        workgroupsX: Math.ceil(width / 64),
        workgroupsY: height,
        skipOutputDef: true,
      },
      renderPass: {
        vbos: [{ uv: "vec2f" }],
        vertexCount: 3,
        textures: { smoothed: { width, height, isStorage: true } },
      },
    },
    first,
  );
  async function frame(time, controls = {}) {
    await first.process(time / 1000);
    if (definition.adjustable) await second.process(controls.amount ?? 1);
    else await second.process();
    await second.render();
  }
  return { pipelines: [first, second], frame };
}

export default { ...demoDefinition, setup };
