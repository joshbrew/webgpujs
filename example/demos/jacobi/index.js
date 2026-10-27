import { WebGPUjs } from "../../../src/pipeline";
import { relax, display } from "./shaders.js";
function createPlan() {
  let current = "A";
  return Array.from({ length: 64 }, (_, iteration) => {
    const next = current === "A" ? "B" : "A",
      stage = {
        shader: relax,
        resources: { current, next },
        inputs: { iteration },
      };
    current = next;
    return stage;
  });
}
function createInputs(controls = {}, seed = 0) {
  return {
    A: new Float32Array(64),
    B: new Float32Array(64),
    forcing: Float32Array.from(
      { length: 64 },
      (_, i) =>
        Math.sin(
          ((Math.PI * (i + 1)) / 65) * (controls.frequency ?? 1) + seed * 0.2,
        ) * (controls.amplitude ?? 1),
    ),
    iterations: Math.round(controls.iterations ?? 24),
  };
}
export async function setup(canvas, device) {
  const chain = await WebGPUjs.createComputeChain(createPlan(), { device }),
    view = await WebGPUjs.combineShaders(
      display,
      {
        canvas,
        resourceBindings: { values: { resource: "A" } },
        renderPass: { vbos: [], vertexCount: 3 },
      },
      chain.passes.at(-1),
    );
  let seed = 0,
    previous = "",
    input,
    result,
    hover = -1,
    residual = 0;
  async function frame(time, controls = {}) {
    const key = JSON.stringify([
      controls.iterations,
      controls.amplitude,
      controls.frequency,
      seed,
    ]);
    if (key !== previous) {
      input = createInputs(controls, seed);
      await chain.run(input);
      result = await chain.read("A");
      residual = 0;
      for (let i = 0; i < 64; i++)
        residual = Math.max(
          residual,
          Math.abs(
            2 * result[i] -
              (result[i - 1] ?? 0) -
              (result[i + 1] ?? 0) -
              input.forcing[i],
          ),
        );
      previous = key;
    }
    hover = controls.pointer
      ? Math.min(63, Math.max(0, Math.floor(controls.pointer[0] * 64)))
      : -1;
    await view.render({ inputs: { hoverIndex: hover } });
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
    resultName: "A",
    get resultInfo() {
      return (
        "Top / gold: forcing. Middle / cyan: solution. Bottom / coral: equation residual.\n" +
        (input?.iterations ?? 24) +
        " Jacobi iterations · maximum residual " +
        residual.toFixed(5) +
        ". More iterations reduce the remaining equation error.\n" +
        (hover < 0
          ? "Hover to inspect a sample."
          : "x[" +
            hover +
            "] = " +
            result[hover].toFixed(5) +
            " · forcing = " +
            input.forcing[hover].toFixed(5))
      );
    },
  };
}
export default {
  id: "jacobi",
  title: "Jacobi relaxation solver",
  description:
    "Scrub solver iterations and compare the forcing, evolving solution and remaining residual as three curves.",
  category: "Parallel algorithms",
  algorithm: true,
  interactive: true,
  stateType: "grid",
  interactionHint:
    "Change Iterations to see convergence; hover to inspect the solution.",
  controls: [
    ["iterations", "Iterations", 1, 64, 1, 24],
    ["frequency", "Forcing frequency", 1, 6, 1, 1],
    ["amplitude", "Forcing amplitude", 0.2, 2, 0.1, 1],
  ],
  legend: [
    ["#ffb840", "Forcing"],
    ["#4de0cc", "Solution"],
    ["#ff6673", "Residual"],
  ],
  setup,
};
