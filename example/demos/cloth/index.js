import { consumePointerPress } from "../../shared/controls.js";
// Spring cloth
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { clothStep, clothVertex, particleFragment } from "./shaders.js";

const demoDefinition = {
  id: "cloth",
  title: "Spring cloth",
  description:
    "400 points connect through structural springs. Two upper corners are pinned; wind, gravity and your pointer move the mesh.",
  category: "GPU simulations",
  shader: clothStep,
  mode: "cloth",
  stateType: "array<vec4f>",
  width: 20,
  height: 20,
  dt: 0.015,
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

      {
        data[i] = (x / (width - 1)) * 1.6 - 0.8;
        data[i + 1] = 0.8 - (y / (height - 1)) * 1.6;
        data[i + 2] = Math.sin(y * 0.4) * 0.12;
      }
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
    {
      vertex: clothVertex,
      fragment: particleFragment,
    },
    {
      canvas,
      shaderBindings: {
        vertex: { points: { resource: `${definition.id}-A` } },
      },
      renderPass: {
        vbos: [{ color: "vec4f" }],
        vertexCount: 6,
        instanceCount: (width - 1) * (height - 1),
      },
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
    args.push(controls.wind ?? 0.6, time / 1000);
    await first.process(...args);
    await second.process(...args);
    await display.render({}, undefined, width, height, 1);
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

export default {
  ...demoDefinition,
  setup,
  controls: [["wind", "Wind", 0, 2, 0.05, 0.6]],
};

export { simulationSeed };
