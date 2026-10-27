import { consumePointerPress } from "../../shared/controls.js";
import { WebGPUjs } from "../../../src/pipeline";
import { expand, visualize, display } from "./shaders.js";
function createPlan() {
  return [
    ...Array.from({ length: 48 }, (_, level) => ({
      shader: expand,
      inputs: { level, side: 16 },
    })),
    { shader: visualize },
  ];
}
function createInputs(controls = {}, seed = 0, source = 0) {
  const distances = new Uint32Array(256).fill(0xffffffff);
  distances[source] = 0;
  const walls = Uint32Array.from({ length: 256 }, (_, i) => {
    const x = i % 16,
      y = Math.floor(i / 16);
    return (x === 5 && y !== (5 + seed) % 16 && y !== (12 + seed) % 16) ||
      (x === 10 && y !== (9 + seed) % 16)
      ? 1
      : 0;
  });
  walls[source] = 0;
  return { distances, walls, result: new Float32Array(256) };
}
export async function setup(canvas, device) {
  const chain = await WebGPUjs.createComputeChain(createPlan(), { device });
  const view = await WebGPUjs.combineShaders(
    display,
    {
      canvas,
      resourceBindings: {
        values: { resource: "result" },
        walls: { resource: "walls" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  let seed = 0,
    previous = "",
    input,
    distances,
    source = 0,
    hover = -1,
    frontier = 48,
    lastView = "";
  async function frame(time = 0, controls = {}) {
    const p = controls.pointer;
    hover = p
      ? Math.min(15, Math.max(0, Math.floor(p[1] * 16))) * 16 +
        Math.min(15, Math.max(0, Math.floor(p[0] * 16)))
      : -1;
    if (consumePointerPress(controls) && hover >= 0) source = hover;
    const key = source + ":" + seed;
    if (key !== previous) {
      input = createInputs(controls, seed, source);
      await chain.run(input);
      distances = await chain.read("result");
      previous = key;
      lastView = "";
    }
    frontier = controls.animate
      ? Math.floor((time / 1000) * 12) % 49
      : Math.round(controls.frontier ?? 48);
    const draw = frontier + ":" + hover + ":" + key;
    if (draw !== lastView) {
      await view.render({ inputs: { source, frontier, hoverIndex: hover } });
      lastView = draw;
    }
  }
  return {
    chain,
    pipelines: [...chain.passes, view],
    frame,
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
        "Gold: source · gray: walls · teal → orange: distance · red: unreachable.\nSource (" +
        (source % 16) +
        "," +
        Math.floor(source / 16) +
        ") · visible depth " +
        frontier +
        " · " +
        (distances
          ? [...distances].filter((d) => d >= 0 && d <= frontier).length
          : 0) +
        " cells reached.\n" +
        (hover < 0
          ? "Click or drag to move the source. Reset changes wall openings."
          : "Hovered cell " +
            hover +
            ": " +
            (input?.walls[hover]
              ? "wall"
              : distances?.[hover] < 0
                ? "unreachable"
                : "distance " + distances?.[hover]))
      );
    },
  };
}
export default {
  id: "graph-bfs",
  title: "GPU breadth-first grid traversal",
  description:
    "Move the source through a wall grid and inspect the BFS distance wave. Scrub its depth or animate its frontier.",
  category: "Parallel algorithms",
  algorithm: true,
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Click or drag to move the source. Gray cells are walls; Reset changes their openings.",
  controls: [
    ["frontier", "Visible BFS depth", 0, 48, 1, 48],
    ["animate", "Animate frontier", 0, 1, 1, 0],
  ],
  setup,
};
