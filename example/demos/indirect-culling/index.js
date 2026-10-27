import { WebGPUjs } from "../../../src/pipeline";
import { clear, cull, particles, shade } from "./shaders.js";
export async function setup(canvas, device) {
  const args = device.createBuffer({
    size: 16,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.INDIRECT |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC,
  });
  const chain = await WebGPUjs.createComputeChain(
    [
      { shader: clear, options: { computePass: { workgroupsX: 1 } } },
      { shader: cull, options: { computePass: { workgroupsX: 32 } } },
    ],
    { device },
  );
  const points = Float32Array.from({ length: 2048 * 4 }, (_, i) => {
    const n = Math.floor(i / 4);
    return i % 4 === 0
      ? ((n % 64) / 63) * 1.9 - 0.95
      : i % 4 === 1
        ? (Math.floor(n / 64) / 31) * 1.8 - 0.9
        : i % 4 === 2
          ? ((n * 73) % 128) / 127
          : 1;
  });
  const view = await WebGPUjs.combineShaders(
    { vertex: particles, fragment: shade },
    { canvas, renderPass: { vbos: [{ color: "vec4f" }], vertexCount: 6 } },
    chain.passes.at(-1),
  );
  await chain.run({
    args,
    points,
    visible: new Uint32Array(2048),
    center: [0, 0],
    radius: 0.7,
  });
  async function frame(time = 0, controls = {}) {
    const encoder = device.createCommandEncoder();
    const pointer = controls.pointer ?? [0, 0];
    await chain.run(
      {
        center: controls.follow
          ? pointer
          : [Math.sin(time / 2000) * 0.35, Math.cos(time / 2300) * 0.15],
        radius: controls.radius ?? 0.7,
      },
      { commandEncoder: encoder },
    );
    await view.render({ commandEncoder: encoder, indirect: { buffer: args } });
    device.queue.submit([encoder.finish()]);
  }
  return {
    pipelines: [...chain.passes, view],
    chain,
    frame,
    info: "Compute compacts visible indices and atomically writes draw arguments. The render pass draws exactly that many instances with drawIndirect; no count returns to the CPU.",
    dispose() {
      args.destroy();
    },
  };
}
export default {
  id: "indirect-culling",
  interactive: true,
  interactionHint:
    "Enable Follow pointer, then move across the preview to choose the visible region.",
  title: "GPU culling → indirect instancing",
  description:
    "Two compute passes reset and build an indirect draw buffer. Rendering consumes the compacted particle list and GPU-generated instance count directly.",
  category: "WebGPU features",
  controls: [
    ["radius", "Visibility radius", 0.1, 1.5, 0.01, 0.7],
    ["follow", "Follow pointer", 0, 1, 1, 0],
  ],
  setup,
};
