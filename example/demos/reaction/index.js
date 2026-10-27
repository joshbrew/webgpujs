// Reaction-diffusion chemistry
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { reactionStep, textureVertex, reactionFragment } from "./shaders.js";

const demoDefinition = {
  id: "reaction",
  controls: [
    ["feed", "Feed", 0.02, 0.08, 0.001, 0.055],
    ["kill", "Kill", 0.045, 0.07, 0.001, 0.062],
  ],
  title: "Reaction-diffusion chemistry",
  description:
    "Two chemicals diffuse and react in alternating floating-point textures. Six shader stages share the simulation resources.",
};

async function reactionDiffusion(canvas, device) {
  const width = canvas.width,
    height = canvas.height;
  const usage =
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.STORAGE_BINDING |
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.COPY_SRC;
  const seed = reactionSeed(width, height);
  const texture = { width, height, format: "rgba32float", buffer: seed, usage };
  const bindings = {
    readState: { texture: { sampleType: "unfilterable-float" } },
    displayState: { texture: { sampleType: "unfilterable-float" } },
  };
  const sources = {
    compute: reactionStep,
    vertex: textureVertex,
    fragment: reactionFragment,
  };
  const first = await WebGPUjs.createPipeline(sources, {
    device,
    canvas,
    bindings,
    workGroupSize: 64,
    shaderBindings: {
      compute: {
        readState: { resource: "chemical-A" },
        writeState: {
          resource: "chemical-B",
          type: "texture_storage_2d<rgba32float,write>",
        },
      },
      fragment: { displayState: { resource: "chemical-B" } },
    },
    computePass: {
      workgroupsX: Math.ceil(width / 64),
      workgroupsY: height,
      skipOutputDef: true,
    },
    renderPass: {
      vbos: [{ uv: "vec2f" }],
      vertexCount: 3,
      textures: { readState: texture, writeState: texture },
    },
  });
  const second = await WebGPUjs.combineShaders(
    sources,
    {
      canvas,
      bindings,
      workGroupSize: 64,
      shaderBindings: {
        compute: {
          readState: { resource: "chemical-B" },
          writeState: {
            resource: "chemical-A",
            type: "texture_storage_2d<rgba32float,write>",
          },
        },
        fragment: { displayState: { resource: "chemical-A" } },
      },
      computePass: {
        workgroupsX: Math.ceil(width / 64),
        workgroupsY: height,
        skipOutputDef: true,
      },
      renderPass: { vbos: [{ uv: "vec2f" }], vertexCount: 3 },
    },
    first,
  );
  async function frame(feed = 0.055, kill = 0.062, steps = 4) {
    for (let step = 0; step < steps; step++) {
      await first.process(feed, kill);
      await second.process(feed, kill);
    }
    await second.render();
  }
  return {
    first,
    second,
    reset() {
      first.compute.updateTexture(texture, "readState");
      first.compute.updateTexture(texture, "writeState");
    },
    frame,
  };
}

function sourceText(value) {
  return typeof value === "function"
    ? (value.sourceCode ?? value.toString())
    : value;
}

function reactionSeed(width, height) {
  const seed = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (x + y * width) * 4;
      seed[at] = 1;
      seed[at + 3] = 1;
      // A regular seed pattern makes resetting deterministic and lets patterns meet.
      if (Math.abs((x % 40) - 20) < 5 && Math.abs((y % 40) - 20) < 5) {
        seed[at] = 0.5;
        seed[at + 1] = 0.8;
      }
    }
  return seed;
}

export async function setup(canvas, device, options = {}) {
  const demo = await reactionDiffusion(canvas, device);
  let last = -Infinity;
  async function frame(time, controls = {}) {
    if (controls.speed === 0 || time - last < 16) return;
    last = time;
    await demo.frame(
      controls.feed ?? 0.055,
      controls.kill ?? 0.062,
      Math.max(1, Math.round(4 * (controls.speed ?? 1))),
    );
  }
  return {
    ...demo,
    pipelines: [demo.first, demo.second],
    frame,
    hostFrameSource: sourceText(demo.frame),
  };
}

export default { ...demoDefinition, setup };

export { reactionDiffusion, sourceText, reactionSeed };
