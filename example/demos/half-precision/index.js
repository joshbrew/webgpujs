import { WebGPUjs } from "../../../src/pipeline";
import {
  halfTransform,
  inspectHalf,
  fullPrecision,
  display,
} from "./shaders.js";
export async function setup(canvas, device) {
  const half = device.features.has("shader-f16");
  const chain = await WebGPUjs.createComputeChain(
    half ? [halfTransform, inspectHalf] : [fullPrecision],
    { device },
  );
  const input = Float32Array.from(
    { length: 256 },
    (_, i) => (0.5 + 0.5 * Math.sin(i * 0.17)) * 0.8,
  );
  const allocations = {
    input,
    result: new Float32Array(256),
    error: new Float32Array(256),
    ...(half ? { packed: new Float32Array(256) } : {}),
  };
  await chain.run({ ...allocations, gain: 1.234 });
  const view = await WebGPUjs.combineShaders(
    display,
    { canvas, renderPass: { vbos: [], vertexCount: 3 } },
    chain.passes.at(-1),
  );
  let previous = 1.234,
    errorScale = 2000;
  async function frame(time, controls = {}) {
    const gain = controls.gain ?? 1.234;
    if (gain !== previous) {
      await chain.run({ gain });
      previous = gain;
    }
    errorScale = controls.errorScale ?? 2000;
    await view.render({ inputs: { errorScale } });
  }
  return {
    chain,
    pipelines: [...chain.passes, view],
    frame,
    continuous: false,
    half,
    get resultInfo() {
      return half
        ? `Native f16 arithmetic/storage: ${chain.getBuffer("packed").size} bytes, versus ${input.byteLength} bytes for f32. Left: result. Right: absolute error × ${errorScale}.`
        : `shader-f16 is not enabled on this device; showing the f32 fallback. Left: result. Right: zero error. The gallery requests f16 when supported.`;
    },
  };
}
export default {
  id: "half-precision",
  title: "Half-precision storage and error",
  description:
    "Native f16 arithmetic and compact storage feed a JavaScript error visualizer. A clearly labeled f32 fallback runs when the optional feature is unavailable.",
  category: "WebGPU features",
  algorithm: true,
  controls: [
    ["gain", "Transform gain", 0.2, 2, 0.01, 1.234],
    ["errorScale", "Error magnification", 100, 5000, 100, 2000],
  ],
  setup,
};
