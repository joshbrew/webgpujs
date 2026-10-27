import { consumePointerPress } from "../../shared/controls.js";
import { WebGPUjs } from "../../../src/pipeline";
import { assign, updateCenters, display } from "./shaders.js";
function createPlan() {
  const stages = [];
  let current = "centers-A";
  for (let iteration = 0; iteration < 8; iteration++) {
    const next = current === "centers-A" ? "centers-B" : "centers-A";
    stages.push(
      { shader: assign, resources: { centers: current } },
      {
        shader: updateCenters,
        resources: { centers: current, next },
        inputs: { iteration },
      },
    );
    current = next;
  }
  stages.push({ shader: assign, resources: { centers: current } });
  return stages;
}
function createInputs(controls = {}, seed = 0) {
  const base = [[0.2, 0.22], [0.76, 0.25], controls.dataCenter || [0.5, 0.76]],
    spread = controls.spread ?? 0.12;
  const points = Float32Array.from({ length: 512 }, (_, i) => {
    const j = Math.floor(i / 2),
      a = j * 2.39996 + seed * 0.4,
      n = Math.sin(j * 12.9898 + seed * 3.1) * 43758.5453,
      r = Math.sqrt(n - Math.floor(n)) * spread;
    return base[j % 3][i % 2] + (i % 2 ? Math.sin(a) : Math.cos(a)) * r;
  });
  return {
    points,
    labels: new Uint32Array(256),
    "centers-A": new Float32Array([0.37, 0.42, 0.5, 0.38, 0.62, 0.48]),
    "centers-B": new Float32Array(6),
    iterations: Math.round(controls.iterations ?? 4),
  };
}
export async function setup(canvas, device) {
  const chain = await WebGPUjs.createComputeChain(createPlan(), { device });
  const view = await WebGPUjs.combineShaders(
    display,
    {
      canvas,
      resourceBindings: {
        points: { resource: "points" },
        labels: { resource: "labels" },
        centers: { resource: "centers-A" },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  let seed = 0,
    previous = "",
    input,
    dragCenter,
    summary = "";
  async function frame(time, controls = {}) {
    if (consumePointerPress(controls) && controls.pointer)
      dragCenter = [...controls.pointer];
    const key = JSON.stringify([
      controls.spread,
      controls.iterations,
      dragCenter,
      seed,
    ]);
    if (key !== previous) {
      input = createInputs({ ...controls, dataCenter: dragCenter }, seed);
      await chain.run(input);
      const labels = await chain.read("labels"),
        counts = [0, 0, 0];
      for (const label of labels) counts[label]++;
      summary =
        "Cyan / orange / violet: cluster membership. Crosses: current centroids.\n" +
        input.iterations +
        " clustering iterations · " +
        counts.join(" / ") +
        " points per cluster. Drag to move the third data cloud; use Iterations to see convergence.";
      previous = key;
    }
    await view.render({ inputs: { regions: controls.regions ?? 1 } });
  }
  return {
    chain,
    pipelines: [...chain.passes, view],
    frame,
    continuous: false,
    reset() {
      seed++;
      previous = "";
      dragCenter = undefined;
    },
    get input() {
      return input;
    },
    resultName: "labels",
    get resultInfo() {
      return summary;
    },
  };
}
export default {
  id: "kmeans",
  title: "K-means assignment and centroid updates",
  description:
    "Explore cluster assignment and convergence. Drag a point cloud, widen the clusters, and step through the iterations.",
  category: "Parallel algorithms",
  algorithm: true,
  interactive: true,
  stateType: "points",
  interactionHint:
    "Hold and drag to move the third point cloud. White crosses mark the current centroids.",
  controls: [
    ["spread", "Cluster spread", 0.04, 0.3, 0.01, 0.12],
    ["iterations", "Iterations", 0, 8, 1, 4],
    ["regions", "Show cluster regions", 0, 1, 1, 1],
  ],
  legend: [
    ["#33f2b2", "Cluster 1"],
    ["#ff8040", "Cluster 2"],
    ["#8099ff", "Cluster 3"],
    ["#fff5cc", "Centroids"],
  ],
  setup,
};
