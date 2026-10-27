import { WebGPUjs } from "../../../src/pipeline";
import { insert, lookup, display } from "./shaders.js";
function createInputs(controls = {}, seed = 0) {
  const count = Math.round(controls.count ?? 256),
    stride = Math.round(controls.stride ?? 4);
  return {
    keys: Uint32Array.from(
      { length: count },
      (_, i) => 1 + i * stride + (seed % 31) * 17,
    ),
    tableKeys: new Uint32Array(512),
    tableValues: new Uint32Array(512),
    result: new Float32Array(count),
  };
}
export async function setup(canvas, device) {
  const chain = await WebGPUjs.createComputeChain([insert, lookup], { device });
  const view = await WebGPUjs.combineShaders(
    display,
    {
      canvas,
      resourceBindings: {
        tableKeys: { resource: "tableKeys" },
        values: { resource: "result" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  let seed = 0,
    previous = "",
    input,
    table,
    hover = -1,
    maxProbe = 0;
  async function frame(time, controls = {}) {
    const key = JSON.stringify([controls.count, controls.stride, seed]);
    if (key !== previous) {
      input = createInputs(controls, seed);
      await chain.run(input);
      table = await chain.read("tableKeys");
      maxProbe = 0;
      for (let slot = 0; slot < 512; slot++)
        if (table[slot])
          maxProbe = Math.max(
            maxProbe,
            (slot + 512 - ((Math.imul(table[slot], 2654435761) >>> 0) & 511)) %
              512,
          );
      previous = key;
    }
    const p = controls.pointer;
    hover =
      p && p[0] >= 0 && p[0] < 0.6 && p[1] >= 0 && p[1] <= 1
        ? Math.min(15, Math.floor(p[1] * 16)) * 32 +
          Math.min(31, Math.floor((p[0] / 0.6) * 32))
        : -1;
    await view.render({
      inputs: {
        hoverIndex: hover,
        maximum: Math.max(1, input.keys.at(-1) ** 2),
      },
    });
  }
  return {
    chain,
    pipelines: [...chain.passes, view],
    frame,
    continuous: false,
    reset() {
      seed++;
      previous = "";
    },
    get input() {
      return input;
    },
    resultName: "result",
    get resultInfo() {
      return (
        "Left: 512 hash buckets · cyan = direct placement, orange = extra probes. Right: lookup results (key²).\n" +
        (input?.keys.length ?? 0) +
        " keys · " +
        (((input?.keys.length ?? 0) / 512) * 100).toFixed(1) +
        "% load · longest probe " +
        maxProbe +
        ".\n" +
        (hover < 0
          ? "Hover a bucket to inspect it."
          : "Bucket " +
            hover +
            ": " +
            (table[hover]
              ? "key " + table[hover] + ", value " + table[hover] ** 2
              : "empty"))
      );
    },
  };
}
export default {
  id: "gpu-hash",
  title: "Atomic GPU hash table",
  description:
    "See table occupancy, collisions and lookup values. Increase key count or spacing to create more probing.",
  category: "Parallel algorithms",
  algorithm: true,
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Hover the bucket grid to inspect a key. Change spacing and load to create collisions.",
  controls: [
    ["count", "Keys inserted", 32, 448, 32, 256],
    ["stride", "Key spacing", 1, 8, 1, 4],
  ],
  legend: [
    ["#25ccb0", "Direct bucket"],
    ["#ff6638", "Probe collision"],
    ["#80a6ff", "Lookup result"],
  ],
  setup,
};
