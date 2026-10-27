// Explicit particle field
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { particleField, particleVertex, particleFragment } from "./shaders.js";

const demoDefinition = {
  id: "particles",
  controls: [["exposure", "Exposure", 0.2, 1.8, 0.01, 1]],
  title: "Explicit particle field",
  description:
    "Compute and vertex shaders use different names and binding slots for the same 2,048-particle buffer.",
};

async function explicitParticles(canvas, device) {
  const pipeline = await WebGPUjs.createPipeline(
    {
      compute: particleField,
      vertex: particleVertex,
      fragment: particleFragment,
    },
    {
      device,
      canvas,
      workGroupSize: 64,
      shaderBindings: {
        compute: {
          state: { group: 0, binding: 3, resource: "particle-state" },
        },
        vertex: {
          points: { group: 1, binding: 5, resource: "particle-state" },
        },
        fragment: { uniforms: { group: 1, binding: 7 } },
      },
      computePass: { workgroupsX: 32, skipOutputDef: true },
      renderPass: {
        vbos: [{ color: "vec4f" }],
        vertexCount: 6,
        instanceCount: 2048,
      },
    },
  );
  pipeline.compute.buffer({}, new Float32Array(2048 * 4), 0);
  async function frame(time, exposure = 1) {
    await pipeline.process(undefined, time);
    // Render inputs follow vertex arguments, then fragment arguments.
    await pipeline.render(undefined, undefined, exposure);
  }
  return { pipeline, frame };
}

function sourceText(value) {
  return typeof value === "function"
    ? (value.sourceCode ?? value.toString())
    : value;
}

export async function setup(canvas, device, options = {}) {
  const demo = await explicitParticles(canvas, device);
  return {
    ...demo,
    pipelines: [demo.pipeline],
    frame: (time, controls = {}) =>
      demo.frame(time / 1000, controls.exposure ?? 1),
    hostFrameSource: sourceText(demo.frame),
  };
}

export default { ...demoDefinition, setup };

export { explicitParticles, sourceText };
