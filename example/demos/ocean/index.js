import { WebGPUjs } from "../../../src/pipeline";
import { mat4 } from "wgpu-matrix";
import { waveGeometry, waterVertex, waterNormals } from "./shaders.js";
export async function setup(canvas, device) {
  const size = 96;
  const pipeline = await WebGPUjs.createPipeline(
    { compute: waveGeometry, vertex: waterVertex, fragment: waterNormals },
    {
      device,
      canvas,
      computePass: {
        workgroupsX: Math.ceil((size * size) / 64),
        skipOutputDef: true,
      },
      renderPass: {
        vbos: [{ world: "vec3f", surfaceNormal: "vec3f" }],
        vertexCount: (size - 1) ** 2 * 6,
      },
      renderPipelineDescriptor: { multisample: { count: 4 } },
    },
  );
  pipeline.compute.buffer({
    inputs: {
      positions: new Float32Array(size * size * 4),
      normals: new Float32Array(size * size * 4),
      size,
      time: 0,
      height: 0.7,
    },
  });
  pipeline.fragment.renderPassDescriptor.colorAttachments[0].clearValue = {
    r: 0.42,
    g: 0.63,
    b: 0.78,
    a: 1,
  };
  async function frame(time = 0, controls = {}) {
    const pointer = controls.pointer ?? [0, 0],
      angle = 0.55 + pointer[0] * 0.9,
      distance = 8 / (controls.zoom ?? 1),
      eye = [
        Math.sin(angle) * distance,
        2.8 + pointer[1] * 1.5,
        Math.cos(angle) * distance,
      ];
    const camera = mat4.multiply(
      mat4.perspective(0.95, canvas.width / canvas.height, 0.1, 80),
      mat4.lookAt(eye, [0, -0.1, 0], [0, 1, 0]),
    );
    const encoder = device.createCommandEncoder();
    await pipeline.compute.run({
      commandEncoder: encoder,
      skipOutputDef: true,
      inputs: { time: time / 1000, height: controls.height ?? 0.7 },
    });
    await pipeline.render({
      commandEncoder: encoder,
      inputs: {
        size,
        camera,
        eye,
        sun: [
          Math.cos(controls.light ?? 1),
          0.8,
          Math.sin(controls.light ?? 1),
        ],
        roughness: controls.roughness ?? 0.16,
        reflection: controls.reflection ?? 0.9,
      },
    });
    device.queue.submit([encoder.finish()]);
  }
  return {
    pipelines: [pipeline],
    frame,
    info: "A 96×96 compute-generated mesh feeds perspective rendering with analytic normals, sky reflections, Fresnel shading and sun glints. Move the pointer to orbit the camera.",
  };
}
export default {
  id: "ocean",
  title: "3D water and reflections",
  description:
    "A real wave mesh, animated normals and perspective camera. Move the pointer to orbit over reflective water.",
  category: "Graphics & lighting",
  interactive: true,
  interactionHint:
    "Move the pointer to orbit; adjust wave height, reflections and surface roughness.",
  controls: [
    ["height", "Wave height", 0, 1.5, 0.05, 0.7],
    ["roughness", "Surface roughness", 0.06, 0.5, 0.01, 0.16],
    ["reflection", "Sky reflection", 0, 1, 0.05, 0.9],
    ["light", "Sun direction", 0, 6.28, 0.05, 1],
    ["zoom", "Zoom", 0.5, 2, 0.05, 1],
  ],
  setup,
};
