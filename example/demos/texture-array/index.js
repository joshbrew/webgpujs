import { WebGPUjs } from "../../../src/pipeline";
import { display } from "./shaders.js";

export async function setup(canvas, device) {
  const size = 64,
    layers = 8,
    pixels = new Uint8Array(size * size * layers * 4);
  for (let layer = 0; layer < layers; layer++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const phase = (layer / layers) * Math.PI * 2,
          cx = 0.5 + Math.cos(phase) * 0.25,
          cy = 0.5 + Math.sin(phase) * 0.25,
          d = Math.hypot(x / 63 - cx, y / 63 - cy),
          glow = Math.max(0, 1 - d * 6),
          i = ((layer * size + y) * size + x) * 4;
        pixels[i] = 20 + glow * 225;
        pixels[i + 1] = 35 + glow * (100 + layer * 15);
        pixels[i + 2] = 70 + glow * 150;
        pixels[i + 3] = 255;
      }
  const pipeline = await WebGPUjs.createPipeline(display, {
    device,
    canvas,
    samplers: { frameSampler: { minFilter: "linear", magFilter: "linear" } },
    renderPass: {
      vbos: [],
      vertexCount: 3,
      textures: {
        frames: {
          width: size,
          height: size,
          depthOrArrayLayers: layers,
          buffer: pixels,
        },
      },
    },
  });
  let previous = -1;
  async function frame(time = 0, controls = {}) {
    const layer =
      controls.auto === 0
        ? Math.round(controls.layer ?? 0)
        : Math.floor((time / 1000) * (controls.fps ?? 8)) % 8;
    if (layer === previous) return;
    previous = layer;
    await pipeline.render({ inputs: { layer } });
  }
  return {
    pipelines: [pipeline],
    frame,
    info: "Eight frames occupy array layers in one GPUTexture. Only the layer uniform changes during playback; no frame pixels are uploaded per update.",
  };
}
export default {
  id: "texture-array",
  title: "Texture-array flipbook",
  description:
    "A single typed upload creates eight animation layers. Automatic playback or manual selection changes a texture-array index instead of uploading another image.",
  category: "WebGPU features",
  algorithm: true,
  controls: [
    ["auto", "Automatic playback", 0, 1, 1, 1],
    ["fps", "Frames per second", 1, 16, 1, 8],
    ["layer", "Manual layer", 0, 7, 1, 0],
  ],
  setup,
};
