import { WebGPUjs } from "../../../src/pipeline";
import { triangle, shade } from "./shaders.js";
export async function setup(canvas, device) {
  const query = device.createQuerySet({ type: "occlusion", count: 1 });
  const resolved = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });
  const staging = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const pipeline = await WebGPUjs.createPipeline(
    { vertex: triangle, fragment: shade },
    {
      device,
      canvas,
      renderPass: { vbos: [{ color: "vec4f" }], vertexCount: 3 },
    },
  );
  pipeline.fragment.renderPassDescriptor.occlusionQuerySet = query;
  let summary = "",
    last = -Infinity;
  async function frame(time = 0, controls = {}) {
    if (time - last < 100) return;
    last = time;
    const fraction = controls.fraction ?? 0.7,
      width = Math.max(1, Math.floor(canvas.width * fraction)),
      height = Math.max(1, Math.floor(canvas.height * fraction));
    const encoder = device.createCommandEncoder();
    await pipeline.render({
      commandEncoder: encoder,
      inputs: { time: time / 1000, offset: controls.offset ?? 0 },
      occlusionQueryIndex: 0,
      scissorRect: {
        x: Math.floor((canvas.width - width) / 2),
        y: Math.floor((canvas.height - height) / 2),
        width,
        height,
      },
    });
    encoder.resolveQuerySet(query, 0, 1, resolved, 0);
    encoder.copyBufferToBuffer(resolved, 0, staging, 0, 8);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const count = new BigUint64Array(staging.getMappedRange())[0];
    staging.unmap();
    summary = `${count === 0n ? "Occluded: no visible samples" : "Visible: at least one sample passed"} inside the ${width}×${height} scissor. Query readback: 8 bytes.`;
  }
  return {
    pipelines: [pipeline],
    frame,
    get resultInfo() {
      return summary;
    },
    dispose() {
      query.destroy();
      resolved.destroy();
      staging.destroy();
    },
  };
}
export default {
  id: "occlusion-query",
  title: "Occlusion query and scissor",
  description:
    "A rotating triangle is clipped by a controllable scissor. An occlusion query reports whether any samples pass depth/stencil, using native query resolve with wrapper rendering.",
  category: "WebGPU features",
  algorithm: true,
  controls: [
    ["fraction", "Scissor fraction", 0.1, 1, 0.05, 0.7],
    ["offset", "Triangle horizontal offset", -2, 2, 0.05, 0],
  ],
  setup,
};
