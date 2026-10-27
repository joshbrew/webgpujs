import { consumePointerPress } from "../../shared/controls.js";
// Conway’s Game of Life
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { lifeStep, lifeFragment } from "./shaders.js";

const demoDefinition = {
  id: "life",
  title: "Conway’s Game of Life",
  description:
    "A toroidal cellular automaton reads one integer buffer and writes the other, then draws the shared state.",
  category: "GPU simulations",
  shader: lifeStep,
  display: lifeFragment,
  mode: "life",
  stateType: "array<u32>",
  width: 96,
  height: 64,
  dt: 0.02,
  interval: 100,
};

function simulationSeed(definition) {
  const { width, height, stateType, mode } = definition;
  const components = stateType.includes("vec4")
    ? 4
    : stateType.includes("vec2")
      ? 2
      : 1;
  const data = stateType.includes("u32")
    ? new Uint32Array(width * height)
    : new Float32Array(width * height * components);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (x + y * width) * components;
      data[i] = Math.random() > 0.73 ? 1 : 0;
    }
  return data;
}

export async function setup(canvas, device, options = {}) {
  const definition = { ...demoDefinition, ...options };
  const { width, height, shader, stateType } = definition;
  const seed = simulationSeed(definition),
    empty = new seed.constructor(seed.length);
  const first = await WebGPUjs.createPipeline(shader, {
    device,
    resourceBindings: {
      state: { resource: `${definition.id}-A` },
      next: { resource: `${definition.id}-B` },
    },
    computePass: { skipOutputDef: true },
  });
  first.compute.buffer({}, seed, empty, width, height, definition.dt);
  const second = await WebGPUjs.combineShaders(
    shader,
    {
      resourceBindings: {
        state: { resource: `${definition.id}-B` },
        next: { resource: `${definition.id}-A` },
      },
      computePass: { skipOutputDef: true },
    },
    first,
  );
  const particles = stateType.includes("vec4");
  const cloth = definition.mode === "cloth";
  const display = await WebGPUjs.combineShaders(
    definition.display,
    {
      canvas,
      shaderBindings: {
        fragment: { field: { resource: `${definition.id}-A` } },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    second,
  );
  let last = -Infinity;
  async function frame(time, controls = {}) {
    if (time - last < (definition.interval || 16)) return;
    last = time;
    const args = [
      undefined,
      undefined,
      width,
      height,
      controls.dt ?? definition.dt,
    ];
    args.push(
      controls.pointer ?? [0.5, 0.5],
      consumePointerPress(controls) ? 1 : 0,
    );

    await first.process(...args);
    await second.process(...args);
    await display.render({}, undefined, width, height);
  }
  function reset() {
    seed.set(simulationSeed(definition));
    first.compute.updateArrayBuffers({ state: seed, next: empty });
    last = -Infinity;
  }
  async function readback() {
    const r = first.compute.resources.find((r) => r.name === "state");
    return first.compute.getOutputData(first.device.createCommandEncoder(), {
      state: first.resources.get(r.resource).buffer,
    });
  }
  return { pipelines: [first, second, display], frame, reset, readback };
}

export default { ...demoDefinition, setup };

export { simulationSeed };
