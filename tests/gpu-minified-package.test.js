import test from "node:test";
import assert from "node:assert/strict";
import { create, globals } from "webgpu";
import { WebGPUjs } from "../dist/webgpujs.esm.js";

test("fully minified release runs a mixed JS/WGSL chain with aliases and named readback", async () => {
  Object.assign(globalThis, globals);
  const gpu = create([]);
  navigator.gpu = gpu;
  const device = await (await gpu.requestAdapter()).requestDevice();
  let chain;
  device.pushErrorScope("validation");
  try {
    chain = await WebGPUjs.createComputeChain(
      [
        {
          shader: {
            code: 'function scale(samples="array<f32>",gain="f32"){const i=threadId.x;if(i<samples.length)samples[i]*=gain;}',
            transpileString: true,
          },
          resources: { samples: "input" },
          inputs: { gain: 2 },
        },
        {
          shader: {
            entryPoint: "main",
            code: `@group(0) @binding(0) var<storage,read> src: array<f32>;
@group(0) @binding(1) var<storage,read_write> dst: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u) {
  if(id.x<arrayLength(&src)){dst[id.x]=src[id.x]+1;}
}`,
          },
          resources: { src: "input", dst: "result" },
        },
      ],
      { device },
    );
    const output = await chain.run(
      { input: new Float32Array([1, 2, 3, 4]), result: new Float32Array(4) },
      { readback: "result" },
    );
    assert.deepEqual([...output], [3, 5, 7, 9]);
    await chain.dispose();
    assert.equal(chain.disposed, true);
    await device.queue.onSubmittedWorkDone();
  } finally {
    await chain?.dispose();
    const error = await device.popErrorScope();
    device.destroy();
    assert.equal(error, null, error?.message);
  }
});
