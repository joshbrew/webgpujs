import { WebGPUjs } from "../../../src/pipeline";
import { display } from "./shaders.js";

export async function setup(canvas, device) {
  const size = 32,
    pixels = new Uint8Array(size ** 3 * 4);
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = x / 31 - 0.5,
          dy = y / 31 - 0.5,
          dz = z / 31 - 0.5;
        const value =
          Math.max(0, 1 - Math.hypot(dx, dy, dz) * 2.1) *
          (0.55 +
            0.45 * Math.sin(dx * 24) * Math.sin(dy * 24) * Math.cos(dz * 24));
        const i = ((z * size + y) * size + x) * 4;
        pixels[i] = Math.round(value * 255);
        pixels[i + 3] = 255;
      }
  const pipeline = await WebGPUjs.createPipeline(display, {
    device,
    canvas,
    renderPass: {
      vbos: [],
      vertexCount: 3,
      textures: {
        volume: {
          width: size,
          height: size,
          depthOrArrayLayers: size,
          rowsPerImage: size,
          buffer: pixels,
          format: "rgba8unorm",
        },
      },
    },
    samplers: { volumeSampler: { minFilter: "linear", magFilter: "linear" } },
  });
  async function frame(time, controls = {}) {
    await pipeline.render({
      inputs: { angle: controls.angle ?? 0.6, density: controls.density ?? 3 },
    });
  }
  return {
    pipelines: [pipeline],
    frame,
    continuous: false,
    info: "A typed 32³ upload becomes a native 3D texture. Forty-eight samples per pixel integrate density front to back with trilinear filtering.",
  };
}
export default {
  id: "volume-texture",
  title: "3D texture volume raymarch",
  description:
    "A three-dimensional texture stores a procedural density field. Rotate the volume and change its optical density while the fragment shader integrates samples.",
  category: "WebGPU features",
  algorithm: true,
  controls: [
    ["angle", "Volume angle", 0, 6.28, 0.05, 0.6],
    ["density", "Optical density", 0.5, 8, 0.1, 3],
  ],
  setup,
};
