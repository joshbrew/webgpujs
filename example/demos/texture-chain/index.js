// Generate → blur → sample
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import {
  generateTexture,
  blurTexture,
  textureVertex,
  textureFragment,
} from "./shaders.js";

const demoDefinition = {
  id: "texture-chain",
  title: "Generate → blur → sample",
  description:
    "Generate a storage texture, blur it in another compute pass, then sample it in the fragment shader.",
};

async function textureChain(canvas, device) {
  const width = canvas.width,
    height = canvas.height;
  const first = await WebGPUjs.createPipeline(generateTexture, {
    device,
    workGroupSize: 64,
    computePass: {
      workgroupsX: Math.ceil(width / 64),
      workgroupsY: height,
      skipOutputDef: true,
    },
    resourceBindings: { destination: { resource: "original-image" } },
    renderPass: {
      textures: { destination: { width, height, isStorage: true } },
    },
  });
  const second = await WebGPUjs.combineShaders(
    {
      compute: blurTexture,
      vertex: textureVertex,
      fragment: textureFragment,
    },
    {
      canvas,
      workGroupSize: 64,
      shaderBindings: {
        compute: {
          source: { resource: "original-image" },
          smoothed: { resource: "blurred-image" },
        },
        fragment: { displayImage: { resource: "blurred-image" } },
      },
      computePass: {
        workgroupsX: Math.ceil(width / 64),
        workgroupsY: height,
        skipOutputDef: true,
      },
      renderPass: {
        vbos: [{ uv: "vec2f" }],
        vertexCount: 3,
        textures: { smoothed: { width, height, isStorage: true } },
      },
    },
    first,
  );
  async function frame(time) {
    await first.process(time);
    await second.process();
    await second.render();
  }
  return { first, second, frame };
}

function sourceText(value) {
  return typeof value === "function"
    ? (value.sourceCode ?? value.toString())
    : value;
}

export async function setup(canvas, device, options = {}) {
  const demo = await textureChain(canvas, device);
  return {
    ...demo,
    pipelines: [demo.first, demo.second],
    frame: (time, ...args) => demo.frame(time / 1000, ...args),
    hostFrameSource: sourceText(demo.frame),
  };
}

export default { ...demoDefinition, setup };

export { textureChain, sourceText };
