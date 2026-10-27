import { WebGPUjs } from "../../../src/pipeline";
import { geometry, lighting } from "./shaders.js";
export async function setup(canvas, device) {
  const textures = Array.from({ length: 2 }, () =>
    device.createTexture({
      size: [canvas.width, canvas.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }),
  );
  const gbuffer = await WebGPUjs.createPipeline(geometry, {
    device,
    canvas,
    renderPipelineDescriptor: {
      depthStencil: undefined,
      fragment: {
        targets: [{ format: "rgba8unorm" }, { format: "rgba8unorm" }],
      },
    },
    renderPassDescriptor: {
      colorAttachments: textures.map((texture) => ({
        view: texture.createView(),
        loadOp: "clear",
        storeOp: "store",
        clearValue: [0, 0, 0, 0],
      })),
    },
    renderPass: { vbos: [], vertexCount: 3 },
  });
  const compose = await WebGPUjs.createPipeline(lighting, {
    device,
    canvas,
    renderPass: {
      vbos: [],
      vertexCount: 3,
      textures: { albedo: textures[0], normal: textures[1] },
    },
  });
  async function frame(time = 0, controls = {}) {
    const encoder = device.createCommandEncoder();
    await gbuffer.render({
      commandEncoder: encoder,
      inputs: { radius: controls.radius ?? 0.43 },
    });
    await compose.render({
      commandEncoder: encoder,
      inputs: { angle: time / 1600, mode: Math.round(controls.mode ?? 0) },
    });
    device.queue.submit([encoder.finish()]);
  }
  return {
    pipelines: [gbuffer, compose],
    frame,
    info: "JS object returns produce two color attachments: albedo and encoded normals. A second shader lights both textures without CPU copies.",
    dispose() {
      textures.forEach((t) => t.destroy());
    },
  };
}
export default {
  id: "deferred-lighting",
  title: "Deferred lighting with a G-buffer",
  description:
    "A JavaScript fragment shader returns two render targets. A second pass combines their material colors and normals under a rotating light.",
  category: "WebGPU features",
  controls: [
    ["radius", "Sphere radius", 0.2, 0.6, 0.01, 0.43],
    ["mode", "View", 0, 2, 1, 0, ["Lit scene", "Albedo", "Normals"]],
  ],
  setup,
};
