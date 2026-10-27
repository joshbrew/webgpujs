import { WebGPUjs } from "../../../src/pipeline";
import { instances, shade } from "./shaders.js";

export async function setup(canvas, device) {
  const pipeline = await WebGPUjs.createPipeline(
    { vertex: instances, fragment: shade },
    {
      device,
      canvas,
      renderPipelineDescriptor: { multisample: { count: 4 } },
      renderPass: {
        vbos: [{ color: "vec4f" }],
        vertexCount: 3,
        instanceCount: 256,
      },
    },
  );
  async function frame(time = 0, controls = {}) {
    await pipeline.render({
      useRenderBundle: controls.bundle !== 0,
      inputs: { time: (time / 1000) * (controls.rotation ?? 1) },
    });
  }
  return {
    pipelines: [pipeline],
    frame,
    info: "256 instances · 768 triangle vertices · 4× MSAA. A recorded render bundle reuses draw commands while its uniform buffer updates. Toggle the bundle to use ordinary encoding.",
  };
}
export default {
  id: "render-bundles",
  title: "Reusable render bundles and instances",
  description:
    "A grid of instanced triangles animates through changing uniforms while draw commands are reused from a native render bundle. Includes matching multisample color/depth targets.",
  category: "WebGPU features",
  algorithm: true,
  controls: [
    ["bundle", "Reuse render bundle", 0, 1, 1, 1],
    ["rotation", "Rotation rate", 0, 3, 0.05, 1],
  ],
  setup,
};
