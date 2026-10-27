// Bitonic sorting network
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { bitonicStep, barsFragment } from "./shaders.js";

const demoDefinition = {
  id: "sort",
  controls: [["interval", "Stage interval (ms)", 50, 1000, 50, 200]],
  title: "Bitonic sorting network",
  description:
    "28 GPU compare-exchange stages sort 128 values. Each invocation owns one disjoint pair.",
  category: "Parallel algorithms",
  shader: bitonicStep,
};

export async function setup(canvas, device, options = {}) {
  const count = 128,
    data = Float32Array.from(
      { length: count },
      (_, i) => ((i * 73 + 19) % 127) / 127,
    );
  const pipeline = await WebGPUjs.createPipeline(bitonicStep, {
    device,
    computePass: { skipOutputDef: true },
  });
  pipeline.compute.buffer({}, data, 1, 2);
  const display = await WebGPUjs.combineShaders(
    barsFragment,
    {
      canvas,
      resourceBindings: { field: { resource: "sort-display" } },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    pipeline,
  );
  const stages = [];
  for (let sequence = 2; sequence <= count; sequence *= 2)
    for (let distance = sequence / 2; distance >= 1; distance /= 2)
      stages.push({ sequence, distance });
  let stage = 0,
    last = -Infinity;
  async function frame(time, controls = {}) {
    if (!controls.singleStep && time - last < (controls.interval ?? 200))
      return;
    controls.singleStep = false;
    last = time;
    if (stage < stages.length) {
      const { sequence, distance } = stages[stage++];
      await pipeline.process(undefined, distance, sequence);
    }
    await display.render({}, pipeline.compute.bufferGroup.inputBuffers.data, 1);
  }
  function reset() {
    pipeline.compute.updateArrayBuffers({ data });
    stage = 0;
    last = -Infinity;
  }
  async function readback() {
    return pipeline.compute.getOutputData(device.createCommandEncoder(), {
      data: pipeline.compute.bufferGroup.inputBuffers.data,
    });
  }
  return {
    pipelines: [pipeline, display],
    frame,
    reset,
    readback,
    stages: stages.length,
    get progress() {
      return stage;
    },
    get done() {
      return stage === stages.length;
    },
    initial: data,
  };
}

export default { ...demoDefinition, setup };
