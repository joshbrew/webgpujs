import { WebGPUjs } from "../../../src/pipeline";
import { display } from "./shaders.js";

export async function setup(canvas, device) {
  const texture = device.createTexture({
    size: [256, 256],
    mipLevelCount: 9,
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const pipeline = await WebGPUjs.createPipeline(display, {
    device,
    canvas,
    samplers: {
      imageSampler: {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
      },
    },
    renderPass: { vbos: [], vertexCount: 3, textures: { image: texture } },
  });
  const palette = [
    [255, 80, 60],
    [50, 220, 170],
    [70, 120, 255],
    [245, 190, 45],
    [195, 85, 255],
    [50, 230, 240],
    [255, 120, 180],
    [130, 240, 80],
    [240, 240, 240],
  ];
  for (let level = 0; level < 9; level++) {
    const size = Math.max(1, 256 >> level),
      pixels = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const x = i % size,
        y = Math.floor(i / size),
        shade = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 0.35 : 1;
      for (let c = 0; c < 3; c++) pixels[i * 4 + c] = palette[level][c] * shade;
      pixels[i * 4 + 3] = 255;
    }
    pipeline.fragment.updateTexture(
      {
        texture,
        width: size,
        height: size,
        mipLevel: level,
        buffer: pixels,
        format: "rgba8unorm",
      },
      "image",
    );
  }
  async function frame(time, controls = {}) {
    await pipeline.render({
      inputs: { lod: controls.lod ?? 2, tiling: controls.tiling ?? 4 },
    });
  }
  return {
    pipelines: [pipeline],
    frame,
    continuous: false,
    info: "Nine uploaded mip levels have distinct colors. Fractional LOD blends adjacent levels; tiling exposes minification. Texture allocation and uploads use the native texture through WebGPUjs.",
    dispose() {
      texture.destroy();
    },
  };
}
export default {
  id: "mipmaps",
  title: "Mip levels and explicit LOD",
  description:
    "Nine colored mip levels share one texture. Explore fractional LOD, mip filtering and repeated UVs without rebuilding the shader.",
  category: "WebGPU features",
  algorithm: true,
  controls: [
    ["lod", "Mip level", 0, 8, 0.1, 2],
    ["tiling", "UV tiling", 1, 16, 0.5, 4],
  ],
  setup,
};
