import { WebGPUjs } from "../../../src/pipeline";
import { occluder, floor } from "./shaders.js";
export async function setup(canvas, device) {
  const depth = device.createTexture({
    size: [256, 256],
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const light = await WebGPUjs.createPipeline(
    { vertex: occluder },
    {
      device,
      renderPipelineDescriptor: {
        depthStencil: {
          format: "depth32float",
          depthWriteEnabled: true,
          depthCompare: "less",
        },
      },
      renderPassDescriptor: {
        colorAttachments: [],
        depthStencilAttachment: {
          view: depth.createView(),
          depthLoadOp: "clear",
          depthClearValue: 1,
          depthStoreOp: "store",
        },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
  );
  const view = await WebGPUjs.createPipeline(floor, {
    device,
    canvas,
    samplers: {
      compareSampler: {
        compare: "less-equal",
        minFilter: "linear",
        magFilter: "linear",
      },
    },
    renderPass: { vbos: [], vertexCount: 3, textures: { shadowMap: depth } },
  });
  async function frame(time = 0, controls = {}) {
    const encoder = device.createCommandEncoder();
    await light.render({
      commandEncoder: encoder,
      inputs: { offset: Math.sin(time / 1800) * 0.25 },
    });
    await view.render({
      commandEncoder: encoder,
      inputs: {
        reference: controls.reference ?? 0.5,
        mode: Math.round(controls.mode ?? 0),
      },
    });
    device.queue.submit([encoder.finish()]);
  }
  return {
    pipelines: [light, view],
    frame,
    info: "A depth-only native vertex pass projects a triangle into a 256² shadow map. The JS floor compares its depth with a comparison sampler; switch to inspect the depth texture.",
    dispose() {
      depth.destroy();
    },
  };
}
export default {
  id: "shadow-map",
  title: "Depth-only shadow map",
  description:
    "A moving occluder writes an offscreen depth texture. A JavaScript shader samples it with hardware depth comparison to shade a checkerboard floor.",
  category: "WebGPU features",
  controls: [
    ["reference", "Receiver depth", 0, 1, 0.01, 0.5],
    ["mode", "View", 0, 1, 1, 0, ["Shadowed floor", "Depth map"]],
  ],
  setup,
};
