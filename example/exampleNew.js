// Raw WGSL works alongside function shaders. This example is deliberately small;
// see multi-shader.js for buffer and texture chains written in plain JavaScript.
import { WebGPUjs } from "../src/pipeline";

export async function rawComputeExample(device) {
  const code = `
        struct Values { values: array<f32>, };
        @binding(4) @group(0) var<storage, read_write> values: Values;
        @compute @workgroup_size(64)
        fn compute_main(@builtin(global_invocation_id) id: vec3<u32>) {
            if (id.x < arrayLength(&values.values)) { values.values[id.x] *= 2; }
        }
    `;
  const pipeline = await WebGPUjs.createPipeline({ code }, { device });
  await pipeline.process(new Float32Array([1, 2, 3, 4]));
  // Raw shaders have no JavaScript return declarations; select readback explicitly.
  const encoder = device.createCommandEncoder();
  return pipeline.compute.getOutputData(encoder, {
    values: pipeline.compute.bufferGroup.inputBuffers.values,
  });
}
