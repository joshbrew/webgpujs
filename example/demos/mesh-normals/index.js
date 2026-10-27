import { WebGPUjs } from "../../../src/pipeline";
import { surface, mesh, shade } from "./shaders.js";
export async function setup(canvas, device) {
  const pipeline = await WebGPUjs.createPipeline(
    { compute: surface, vertex: mesh, fragment: shade },
    {
      device,
      canvas,
      shaderBindings: {
        compute: {
          positions: { resource: "geometry" },
          normals: { resource: "normals" },
        },
        vertex: {
          vertices: { resource: "geometry" },
          normalData: { resource: "normals" },
        },
      },
      computePass: { workgroupsX: 64, skipOutputDef: true },
      renderPass: {
        vbos: [{ normal: "vec3f", tint: "vec3f" }],
        vertexCount: 63 * 63 * 6,
      },
    },
  );
  pipeline.compute.buffer({
    inputs: {
      positions: new Float32Array(4096 * 4),
      normals: new Float32Array(4096 * 4),
      time: 0,
      amplitude: 0.4,
    },
  });
  const { mat4 } = await import("wgpu-matrix");
  async function frame(time = 0, controls = {}) {
    const angle = controls.angle ?? 0.65;
    const camera = mat4.lookAt(
      [Math.sin(angle) * 5, 3.4, Math.cos(angle) * 5],
      [0, 0, 0],
      [0, 1, 0],
    );
    const projection = mat4.multiply(
      mat4.perspective(1, canvas.width / canvas.height, 0.1, 30),
      camera,
    );
    const encoder = device.createCommandEncoder();
    await pipeline.compute.run({
      commandEncoder: encoder,
      skipOutputDef: true,
      inputs: { time: time / 1200, amplitude: controls.amplitude ?? 0.4 },
    });
    await pipeline.render({ commandEncoder: encoder, inputs: { projection } });
    device.queue.submit([encoder.finish()]);
  }
  return {
    pipelines: [pipeline],
    frame,
    info: "Compute produces 4,096 positions and analytic normals. Explicit aliases connect differently named vertex inputs. 7,938 triangles render directly from storage; no CPU mesh uploads.",
  };
}
export default {
  id: "mesh-normals",
  title: "Compute-generated mesh and normals",
  description:
    "A compute shader animates a height field and its surface normals. A storage-buffer vertex shader assembles triangles and lights the generated geometry.",
  category: "WebGPU features",
  controls: [
    ["amplitude", "Wave height", 0, 1, 0.01, 0.4],
    ["angle", "Camera orbit", -3.14, 3.14, 0.02, 0.65],
  ],
  setup,
};
