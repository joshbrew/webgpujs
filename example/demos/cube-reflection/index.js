import { WebGPUjs } from "../../../src/pipeline";
import { display } from "./shaders.js";

export async function setup(canvas, device) {
  const size = 32,
    pixels = new Uint8Array(size * size * 6 * 4),
    palette = [
      [255, 85, 65],
      [40, 210, 150],
      [80, 130, 255],
      [245, 195, 55],
      [180, 75, 245],
      [45, 220, 245],
    ];
  for (let face = 0; face < 6; face++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = ((face * size + y) * size + x) * 4,
          shade = 0.3 + (0.7 * (x + y)) / (2 * (size - 1));
        for (let c = 0; c < 3; c++) pixels[i + c] = palette[face][c] * shade;
        pixels[i + 3] = 255;
      }
  const pipeline = await WebGPUjs.createPipeline(display, {
    device,
    canvas,
    textureViews: { environment: { dimension: "cube" } },
    samplers: {
      environmentSampler: { minFilter: "linear", magFilter: "linear" },
    },
    renderPass: {
      vbos: [],
      vertexCount: 3,
      textures: {
        environment: {
          width: size,
          height: size,
          depthOrArrayLayers: 6,
          buffer: pixels,
        },
      },
    },
  });
  async function frame(time, controls = {}) {
    await pipeline.render({ inputs: { angle: controls.angle ?? 0.6 } });
  }
  return {
    pipelines: [pipeline],
    frame,
    continuous: false,
    info: "Six 2D array layers are viewed as one cube texture. The sphere samples a reflected direction; the background samples the environment directly.",
  };
}
export default {
  id: "cube-reflection",
  title: "Cube-map reflection lookup",
  description:
    "Six colored texture layers form an environment cube. Reflected directions shade a sphere while a controllable rotation changes the sampled faces.",
  category: "WebGPU features",
  algorithm: true,
  controls: [["angle", "Environment rotation", 0, 6.28, 0.05, 0.6]],
  setup,
};
