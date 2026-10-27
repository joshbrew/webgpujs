import { WebGPUjs } from "../../../src/pipeline";
import { workload, display } from "./shaders.js";
export async function setup(canvas, device) {
  const supported = device.features.has("timestamp-query");
  const query = supported
    ? device.createQuerySet({ type: "timestamp", count: 2 })
    : undefined;
  const resolved = supported
    ? device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      })
    : undefined;
  const staging = supported
    ? device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      })
    : undefined;
  const compute = await WebGPUjs.createPipeline(workload, {
    device,
    computePass: { skipOutputDef: true },
  });
  compute.compute.buffer({
    inputs: {
      values: Float32Array.from({ length: 65536 }, (_, i) =>
        Math.sin(i * 0.01),
      ),
      iterations: 32,
    },
  });
  const view = await WebGPUjs.combineShaders(
    display,
    { canvas, renderPass: { vbos: [], vertexCount: 3 } },
    compute,
  );
  let last = -Infinity,
    summary = "",
    disposed = false;
  async function frame(time = 0, controls = {}) {
    if (disposed || time - last < 250) return;
    last = time;
    const encoder = device.createCommandEncoder(),
      iterations = Math.round(controls.iterations ?? 32),
      start = performance.now();
    await compute.compute.run({
      commandEncoder: encoder,
      skipOutputDef: true,
      inputs: { iterations },
      descriptor: supported
        ? {
            timestampWrites: {
              querySet: query,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          }
        : {},
    });
    if (supported) {
      encoder.resolveQuerySet(query, 0, 2, resolved, 0);
      encoder.copyBufferToBuffer(resolved, 0, staging, 0, 16);
    }
    device.queue.submit([encoder.finish()]);
    if (supported) {
      await staging.mapAsync(GPUMapMode.READ);
      const times = new BigUint64Array(staging.getMappedRange()),
        milliseconds = Number(times[1] - times[0]) / 1e6;
      staging.unmap();
      summary = `GPU compute timestamps: ${milliseconds === 0 ? "below timer resolution" : milliseconds.toFixed(4) + " ms"} · 65,536 invocations × ${iterations} iterations. Query readback: 16 bytes.`;
    } else {
      await device.queue.onSubmittedWorkDone();
      summary = `timestamp-query is not enabled; CPU submission-to-completion time: ${(performance.now() - start).toFixed(3)} ms. The gallery requests GPU timestamps when supported.`;
    }
    await view.render();
  }
  return {
    pipelines: [compute, view],
    frame,
    supported,
    get resultInfo() {
      return summary;
    },
    dispose() {
      disposed = true;
      query?.destroy();
      resolved?.destroy();
      staging?.destroy();
    },
  };
}
export default {
  id: "timestamp-query",
  title: "GPU compute timestamp profiling",
  description:
    "Native timestampWrites and query resolution measure one wrapper compute pass. Unsupported devices use a labeled CPU end-to-end fallback.",
  category: "WebGPU features",
  algorithm: true,
  controls: [["iterations", "Iterations per invocation", 1, 128, 1, 32]],
  setup,
};
