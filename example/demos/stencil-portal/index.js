import { WebGPUjs } from "../../../src/pipeline";
import { mask, world } from "./shaders.js";
export async function setup(canvas, device) {
  const state = (compare) => ({
    format: "depth24plus-stencil8",
    depthWriteEnabled: false,
    depthCompare: "always",
    stencilFront: {
      compare,
      passOp: compare === "always" ? "replace" : "keep",
    },
    stencilBack: { compare, passOp: compare === "always" ? "replace" : "keep" },
  });
  const portal = await WebGPUjs.createPipeline(mask, {
    device,
    canvas,
    renderPipelineDescriptor: {
      depthStencil: state("always"),
      fragment: {
        targets: [
          { format: navigator.gpu.getPreferredCanvasFormat(), writeMask: 0 },
        ],
      },
    },
    renderPass: { vbos: [], vertexCount: 3 },
  });
  const scene = await WebGPUjs.createPipeline(world, {
    device,
    canvas,
    renderPipelineDescriptor: { depthStencil: state("equal") },
    renderPass: { vbos: [], vertexCount: 3 },
  });
  scene.fragment.depthTexture = portal.fragment.depthTexture;
  scene.fragment.renderPassDescriptor.colorAttachments[0].loadOp = "load";
  scene.fragment.renderPassDescriptor.depthStencilAttachment.depthLoadOp =
    "load";
  scene.fragment.renderPassDescriptor.depthStencilAttachment.stencilLoadOp =
    "load";
  async function frame(time = 0, controls = {}) {
    const encoder = device.createCommandEncoder();
    await portal.render({
      commandEncoder: encoder,
      stencilReference: 1,
      inputs: {
        size: [canvas.width, canvas.height],
        radius: controls.radius ?? 0.7,
        time: time / 1800,
      },
    });
    await scene.render({
      commandEncoder: encoder,
      stencilReference: 1,
      inputs: { time: time / 1000 },
    });
    device.queue.submit([encoder.finish()]);
  }
  return {
    pipelines: [portal, scene],
    frame,
    info: "Native WGSL discard writes a circular stencil mask. A plain-JS shader draws only where that shared stencil equals one.",
  };
}
export default {
  id: "stencil-portal",
  title: "A stencil-masked portal",
  description:
    "A native mask shader and JavaScript scene share a depth/stencil attachment across two passes. Move the portal by changing its radius as it drifts.",
  category: "WebGPU features",
  controls: [["radius", "Portal radius", 0.15, 1.2, 0.01, 0.7]],
  setup,
};
