// Parallel prefix scan
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { scanStep, barsFragment } from "./shaders.js";

const demoDefinition = {
  id: "scan",
  controls: [["interval", "Stage interval (ms)", 20, 1000, 10, 180]],
  title: "Parallel prefix scan",
  description:
    "Seven doubling passes compute 128 inclusive prefix sums using alternating buffers.",
  category: "Parallel algorithms",
  shader: scanStep,
};

export async function setup(canvas, device, options = {}) {
  const data = Float32Array.from({ length: 128 }, (_, i) =>
      i % 17 === 0 ? 4 : 1,
    ),
    empty = new Float32Array(128);
  const first = await WebGPUjs.createPipeline(scanStep, {
    device,
    resourceBindings: {
      state: { resource: "scan-A" },
      next: { resource: "scan-B" },
    },
    computePass: { skipOutputDef: true },
  });
  first.compute.buffer({}, data, empty, 1);
  const second = await WebGPUjs.combineShaders(
    scanStep,
    {
      resourceBindings: {
        state: { resource: "scan-B" },
        next: { resource: "scan-A" },
      },
      computePass: { skipOutputDef: true },
    },
    first,
  );
  const display = await WebGPUjs.combineShaders(
    barsFragment,
    {
      canvas,
      resourceBindings: { field: { resource: "scan-display" } },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    second,
  );
  let offset = 1,
    stage = 0,
    last = -Infinity,
    current = first.compute.bufferGroup.inputBuffers.state;
  async function frame(time, controls = {}) {
    if (!controls.singleStep && time - last < (controls.interval ?? 180))
      return;
    controls.singleStep = false;
    last = time;
    if (offset < data.length) {
      const pass = stage++ % 2 === 0 ? first : second;
      await pass.process(undefined, undefined, offset);
      const r = pass.compute.resources.find((r) => r.name === "next");
      current = pass.resources.get(r.resource).buffer;
      offset *= 2;
    }
    await display.render(
      {},
      current,
      data.reduce((a, b) => a + b, 0),
    );
  }
  function reset() {
    first.compute.updateArrayBuffers({ state: data, next: empty });
    offset = 1;
    stage = 0;
    last = -Infinity;
    current = first.compute.bufferGroup.inputBuffers.state;
  }
  async function readback() {
    return first.compute.getOutputData(device.createCommandEncoder(), {
      values: current,
    });
  }
  return {
    pipelines: [first, second, display],
    frame,
    reset,
    readback,
    stages: 7,
    get progress() {
      return stage;
    },
    get done() {
      return offset >= data.length;
    },
    initial: data,
  };
}

export default { ...demoDefinition, setup };
