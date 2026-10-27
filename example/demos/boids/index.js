// Flocking
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { boidsCompute, boidsVertex, colorFragment } from "./shaders.js";

const demoDefinition = {
  id: "boids",
  controls: [["step", "Simulation step", 0.005, 0.15, 0.005, 0.04]],
  title: "Flocking",
  description:
    "512 agents read the previous frame and write a separate buffer, then render directly from the result.",
};

export async function setup(canvas, device, options = {}) {
  const count = 512;
  const pipeline = await WebGPUjs.createPipeline(
    {
      compute: boidsCompute,
      vertex: boidsVertex,
      fragment: colorFragment,
    },
    {
      device,
      canvas,
      computePass: { workgroupsX: Math.ceil(count / 64), skipOutputDef: true },
      renderPass: {
        vbos: [
          { center: "vec2f", velocity: "vec2f", stepMode: "instance" },
          { sprite: "vec2f" },
          { color: "vec4f" },
        ],
        vertexCount: 3,
        instanceCount: count,
      },
    },
  );
  const initial = new Float32Array(count * 4);
  for (let i = 0; i < initial.length; i += 4) {
    initial[i] = Math.random() * 2 - 1;
    initial[i + 1] = Math.random() * 2 - 1;
    initial[i + 2] = (Math.random() - 0.5) * 0.1;
    initial[i + 3] = (Math.random() - 0.5) * 0.1;
  }
  pipeline.compute.buffer({}, initial, new Float32Array(count * 4), 0.04);
  let read = pipeline.compute.bufferGroup.inputBuffers.particlesIn,
    write = pipeline.compute.bufferGroup.inputBuffers.particlesOut;
  pipeline.fragment.updateVBO(
    new Float32Array([-0.008, -0.014, 0.008, -0.014, 0, 0.018]),
    1,
  );
  async function frame(time, controls = {}) {
    const step = (controls.step ?? 0.04) * (controls.speed ?? 1);
    if (!step) return;
    await pipeline.process(read, write, step);
    pipeline.fragment.updateVBO(write, 0);
    await pipeline.render();
    [read, write] = [write, read];
  }
  return { pipelines: [pipeline], frame };
}

export default { ...demoDefinition, setup };
