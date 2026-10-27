import test, { after } from "node:test";
import assert from "node:assert/strict";
import { create, globals } from "webgpu";
import { WebGPUjs } from "../src/pipeline";
import { WGSLTranspiler } from "../src/transpiler";
import * as examples from "../example/shaders.js";
import {
  implicitChain,
  explicitParticles,
  textureChain,
} from "../example/multi-shader.js";
import { rawComputeExample } from "../example/exampleNew.js";
import {
  histogramExample,
  reactionDiffusion,
  reactionSeed,
} from "../example/advanced.js";
import { catalog } from "../example/more-examples.js";
import { editorExamples } from "../example/editor-examples.js";
import {
  buildExample,
  translateDrafts,
  disposeExample,
} from "../example/editor-session.js";

Object.assign(globalThis, globals);
const gpu = create([]);
globalThis.navigator.gpu = gpu;
const adapter = await gpu.requestAdapter();
assert.ok(adapter, "A WebGPU adapter is required for npm run test:gpu");
const device = await adapter.requestDevice();
const errors = [];
device.addEventListener("uncapturederror", (event) =>
  errors.push(event.error.message),
);
after(() => {
  device.destroy();
  assert.deepEqual(errors, []);
});
async function checked(fn) {
  device.pushErrorScope("validation");
  let result;
  try {
    result = await fn();
  } finally {
    const error = await device.popErrorScope();
    assert.equal(error, null, error?.message);
  }
  return result;
}

test("real GPU: implicit compute chain, argument reordering, reuse and resize", () =>
  checked(async () => {
    const first = await WebGPUjs.createPipeline(
      function seed(data = "array<f32>", scale = "f32") {
        let i = threadId.x;
        if (i < data.length) data[i] *= scale;
        return data;
      },
      { device },
    );
    assert.deepEqual(
      Array.from(await first.process(new Float32Array([1, 2, 3, 4, 5]), 2)),
      [2, 4, 6, 8, 10],
    );
    const second = await WebGPUjs.combineShaders(
      function add(offset = "f32", data = "array<f32>") {
        let i = threadId.x;
        if (i < data.length) data[i] += offset;
        return data;
      },
      {},
      first,
    );
    assert.deepEqual(Array.from(await second.process(3)), [5, 7, 9, 11, 13]);
    assert.deepEqual(
      Array.from(await first.process(undefined, 2)),
      [10, 14, 18, 22, 26],
    );
    assert.deepEqual(
      Array.from(await second.process(1, new Float32Array([7, 8]))),
      [8, 9],
    );
    assert.deepEqual(Array.from(await first.process(undefined, 3)), [24, 27]);
  }));

test("real GPU: explicit renamed integer buffer in sparse group", () =>
  checked(async () => {
    const first = await WebGPUjs.createPipeline(
      function seed(values = "array<u32>") {
        let i = threadId.x;
        if (i < values.length) values[i] += 2;
        return values;
      },
      {
        device,
        resourceBindings: {
          values: { group: 2, binding: 7, resource: "state" },
        },
      },
    );
    await first.process(new Uint32Array([4, 5, 6]));
    const second = await WebGPUjs.combineShaders(
      function next(renamed = "array<u32>") {
        let i = threadId.x;
        if (i < renamed.length) renamed[i] *= 3;
        return renamed;
      },
      {
        resourceBindings: {
          renamed: { group: 2, binding: 7, resource: "state" },
        },
      },
      first,
    );
    const result = await second.process();
    assert.ok(result instanceof Uint32Array);
    assert.deepEqual(Array.from(result), [18, 21, 24]);
  }));

test("real GPU: uniform updates, mat3 padding and default uniform refresh", () =>
  checked(async () => {
    const pipeline = await WebGPUjs.createPipeline(
      function uniformsTest(
        output = "array<f32>",
        v = "vec3f",
        matrix = "mat3x3f",
        scalar = "f32",
      ) {
        output[0] = v.x + matrix[2].z + scalar + frame;
        return output;
      },
      { device, computePass: { workgroupsX: 1 } },
    );
    const a = await pipeline.process(
      new Float32Array(1),
      [2, 3, 4],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      5,
    );
    assert.equal(a[0], 16);
    pipeline.compute.updateUBO({ scalar: 8 });
    const b = await pipeline.process();
    assert.equal(b[0], 20);
  }));

test("real GPU: nested helpers and local arrays compile and execute", () =>
  checked(async () => {
    const pipeline = await WebGPUjs.createPipeline(
      function helperTest(output = "array<f32>") {
        function calculate(x = "f32") {
          function square(y = "f32") {
            return y * y;
          }
          if (x > 0) {
            return square(x);
          }
          return 0.0;
        }
        let scratch = new Array(3).fill(vec2f(2, 4));
        output[0] = calculate(scratch[1].y);
        return output;
      },
      { device, computePass: { workgroupsX: 1 } },
    );
    assert.deepEqual(Array.from(await pipeline.process(new Float32Array(1))), [
      16,
    ]);
  }));

test("real GPU: storage texture -> compute sampling -> output readback", () =>
  checked(async () => {
    const first = await WebGPUjs.createPipeline(
      function generate() {
        const size = textureDimensions(destination);
        if (threadId.x < size.x && threadId.y < size.y)
          textureStore(
            destination,
            vec2i(threadId.xy),
            vec4f(0.25, 0.5, 0.75, 1),
          );
      },
      {
        device,
        workGroupSize: 1,
        computePass: { workgroupsX: 7, workgroupsY: 3 },
        resourceBindings: { destination: { resource: "image" } },
        renderPass: {
          textures: { destination: { width: 7, height: 3, isStorage: true } },
        },
      },
    );
    await first.process();
    const second = await WebGPUjs.combineShaders(
      function sample(output = "array<f32>") {
        output[0] = textureLoad(source, vec2i(0, 0), 0).x;
        return output;
      },
      {
        computePass: { workgroupsX: 1 },
        resourceBindings: { source: { resource: "image" } },
      },
      first,
    );
    const result = await second.process(new Float32Array(1));
    assert.ok(Math.abs(result[0] - 0.25) < 0.005);
    const textureResult = await first.compute.run({
      workgroupsX: 7,
      workgroupsY: 3,
      outputTextures: true,
    });
    assert.equal(textureResult.length, 7 * 3 * 4);
    [64, 128, 191, 255].forEach((v, i) =>
      assert.ok(Math.abs(textureResult[i] - v) <= 1),
    );
  }));

test("real GPU: fragment-only and compute/vertex/fragment pipelines", () =>
  checked(async () => {
    const targetTexture = device.createTexture({
      size: [16, 16],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const context = {
      configure() {},
      getCurrentTexture() {
        return targetTexture;
      },
    };
    const canvas = {
      width: 16,
      height: 16,
      getContext() {
        return context;
      },
    };
    const fragmentOnly = await WebGPUjs.createPipeline(
      function fragment() {
        return vec4f(1, 0, 0, 1);
      },
      {
        device,
        canvas,
        context,
        renderPass: { vbos: [], vertexCount: 3 },
        contextSettings: { device, format: "rgba8unorm" },
        renderPipelineDescriptor: { fragment: undefined },
      },
    );
    // Use the native preferred format for the actual render pipeline target.
    fragmentOnly.fragment.updateGraphicsPipeline(
      [],
      { device, format: "rgba8unorm" },
      {
        fragment: {
          module: fragmentOnly.fragment.shaderModule,
          entryPoint: "frag_main",
          targets: [{ format: "rgba8unorm" }],
        },
      },
    );
    await fragmentOnly.render();
    const pipeline = await WebGPUjs.createPipeline(
      {
        compute: function compute(values = "array<f32>") {
          values[0] = 0.5;
        },
        vertex: function vertex(values = "array<f32>") {
          const corners = [vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)];
          position = vec4f(corners[vertexIndex], 0, 1);
          color = vec4f(values[0], 0, 1, 1);
        },
        fragment: function fragment(tint = "vec4f") {
          return color * tint;
        },
      },
      {
        device,
        canvas,
        context,
        renderPass: { vbos: [{ color: "vec4f" }], vertexCount: 3 },
        computePass: { workgroupsX: 1 },
        contextSettings: { device, format: "rgba8unorm" },
      },
    );
    pipeline.fragment.updateGraphicsPipeline(
      [{ color: "vec4f" }],
      { device, format: "rgba8unorm" },
      {
        fragment: {
          module: pipeline.fragment.shaderModule,
          entryPoint: "frag_main",
          targets: [{ format: "rgba8unorm" }],
        },
      },
    );
    await pipeline.process(new Float32Array(1));
    await pipeline.render(undefined, undefined, [1, 1, 1, 1]);
    targetTexture.destroy();
  }));

test("real GPU: shipped DFT, boids and raw WGSL examples", () =>
  checked(async () => {
    const dft = await WebGPUjs.createPipeline(examples.dft, { device });
    const result = await dft.process(
      new Float32Array(64).fill(1),
      new Float32Array(128),
    );
    assert.ok(Math.abs(result[0] - 64) < 0.001);
    assert.ok(Array.from(result.slice(1)).every((v) => Math.abs(v) < 0.001));
    const boids = await WebGPUjs.createPipeline(examples.boidsCompute, {
      device,
      computePass: { workgroupsX: 1 },
    });
    boids.compute.buffer(
      {},
      new Float32Array([0, 0, 0.1, 0]),
      new Float32Array(4),
      0.04,
    );
    await boids.process();
    const next = await boids.compute.getOutputData(
      device.createCommandEncoder(),
      { next: boids.compute.bufferGroup.inputBuffers.particlesOut },
    );
    assert.ok(Math.abs(next[0] - 0.004) < 0.00001);
    assert.deepEqual(Array.from(await rawComputeExample(device)), [2, 4, 6, 8]);
  }));

test("real GPU: complete multi-shader examples render visible pixels", () =>
  checked(async () => {
    const chain = await implicitChain(device);
    assert.deepEqual(Array.from(chain.result), [5, 7, 9, 11, 13, 15, 17, 19]);
    function target() {
      const texture = device.createTexture({
        size: [128, 64],
        format: gpu.getPreferredCanvasFormat(),
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const context = {
        configure() {},
        getCurrentTexture() {
          return texture;
        },
      };
      return {
        texture,
        canvas: {
          width: 128,
          height: 64,
          getContext() {
            return context;
          },
        },
      };
    }
    const p = target(),
      t = target();
    const particles = await explicitParticles(p.canvas, device);
    const textures = await textureChain(t.canvas, device);
    await particles.frame(0.5);
    await textures.frame(0.5);
    for (const { texture } of [p, t]) {
      const result = await textures.first.compute.getOutputData(
        device.createCommandEncoder(),
        { target: texture },
      );
      assert.ok(
        result.some((v, i) => i % 4 !== 3 && v > 0),
        "render output must contain colour",
      );
      texture.destroy();
    }
  }));

test("real GPU: all gallery render shaders compile and draw", () =>
  checked(async () => {
    const target = device.createTexture({
      size: [32, 32],
      format: gpu.getPreferredCanvasFormat(),
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const context = {
      configure() {},
      getCurrentTexture() {
        return target;
      },
    };
    const canvas = {
      width: 32,
      height: 32,
      getContext() {
        return context;
      },
    };
    const triangle = await WebGPUjs.createPipeline(
      { vertex: examples.triangleVertex, fragment: examples.colorFragment },
      {
        device,
        canvas,
        renderPass: { vbos: [{ color: "vec4f" }], vertexCount: 3 },
      },
    );
    await triangle.render();
    await triangle.render({
      useRenderBundle: true,
      viewport: { x: 0, y: 0, width: 32, height: 32, minDepth: 0, maxDepth: 1 },
    });
    const fractal = await WebGPUjs.createPipeline(examples.mandelbrot, {
      device,
      canvas,
      renderPass: { vbos: [], vertexCount: 3 },
    });
    await fractal.render({}, 1, [-0.5, 0]);
    const cube = await WebGPUjs.createPipeline(
      { vertex: examples.cubeVertex, fragment: examples.cubeFragment },
      {
        device,
        canvas,
        renderPass: {
          vbos: [{ vertex: "vec4f", color: "vec4f", uv: "vec2f" }],
          vertexCount: 3,
          textures: {
            image: {
              width: 1,
              height: 1,
              buffer: new Uint8Array([255, 255, 255, 255]),
            },
          },
        },
      },
    );
    await cube.render({}, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const boids = await WebGPUjs.createPipeline(
      { vertex: examples.boidsVertex, fragment: examples.colorFragment },
      {
        device,
        canvas,
        renderPass: {
          vbos: [
            { center: "vec2f", velocity: "vec2f", stepMode: "instance" },
            { sprite: "vec2f" },
            { color: "vec4f" },
          ],
          vertexCount: 3,
          instanceCount: 1,
        },
      },
    );
    await boids.render();
    target.destroy();
  }));

test("real GPU: atomic histogram, reduction and shared read-only display", () =>
  checked(async () => {
    const texture = device.createTexture({
      size: [128, 64],
      format: gpu.getPreferredCanvasFormat(),
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const context = {
      configure() {},
      getCurrentTexture() {
        return texture;
      },
    };
    const canvas = {
      width: 128,
      height: 64,
      getContext() {
        return context;
      },
    };
    const pipeline = await histogramExample(canvas, device);
    const samples = new Float32Array([0, 0, 0.5, 0.5, 0.5, 1]);
    assert.deepEqual(Array.from(await pipeline.update(samples)), [6, 3, 159]);
    assert.deepEqual(
      Array.from(await pipeline.update(new Float32Array([0, 1]))),
      [2, 1, 63],
    );
    texture.destroy();
  }));

test("real GPU: RGBA32F ping-pong reaction diffusion evolves and resets", () =>
  checked(async () => {
    const target = device.createTexture({
      size: [64, 64],
      format: gpu.getPreferredCanvasFormat(),
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const context = {
      configure() {},
      getCurrentTexture() {
        return target;
      },
    };
    const canvas = {
      width: 64,
      height: 64,
      getContext() {
        return context;
      },
    };
    const pipeline = await reactionDiffusion(canvas, device);
    await pipeline.frame(0.055, 0.062, 3);
    const resource = pipeline.first.compute.resources.find(
      (r) => r.name === "readState",
    );
    const texture = pipeline.first.resources.get(resource.resource).texture;
    const result = await pipeline.first.compute.getOutputData(
      device.createCommandEncoder(),
      { state: texture },
    );
    const initial = reactionSeed(64, 64);
    assert.ok(result.every(Number.isFinite));
    assert.ok(
      result.some((v, i) => Math.abs(v - initial[i]) > 0.01),
      "chemistry must evolve",
    );
    pipeline.reset();
    const reset = await pipeline.first.compute.getOutputData(
      device.createCommandEncoder(),
      { state: texture },
    );
    assert.deepEqual(reset, initial);
    target.destroy();
  }));

for (const definition of catalog)
  test(`real GPU: study ${definition.id}`, () =>
    checked(async () => {
      const texture = device.createTexture({
        size: [64, 48],
        format: gpu.getPreferredCanvasFormat(),
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const context = {
        configure() {},
        getCurrentTexture() {
          return texture;
        },
      };
      const canvas = {
        width: 64,
        height: 48,
        getContext() {
          return context;
        },
      };
      const demo = await definition.setup(definition, canvas, device);
      const iterations = demo.stages || 3;
      for (let i = 0; i < iterations; i++) await demo.frame(i * 250);
      if (demo.readback) {
        const values = await demo.readback();
        assert.ok(values.every(Number.isFinite));
        if (definition.id === "sort")
          assert.deepEqual(
            Array.from(values),
            Array.from(demo.initial).sort((a, b) => a - b),
          );

        if (definition.id === "scan") {
          let sum = 0;
          assert.deepEqual(
            Array.from(values),
            Array.from(demo.initial, (v) => (sum += v)),
          );
        }
      }
      const result = await demo.pipelines[0].compute?.getOutputData(
        device.createCommandEncoder(),
        { target: texture },
      );
      if (result) assert.ok(result.some((v, i) => i % 4 !== 3 && v > 0));
      texture.destroy();
    }));

function editorCanvas() {
  const target = device.createTexture({
    size: [64, 48],
    format: gpu.getPreferredCanvasFormat(),
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const context = {
    configure() {},
    unconfigure() {},
    getCurrentTexture() {
      return target;
    },
  };
  return {
    target,
    canvas: {
      width: 64,
      height: 48,
      getContext() {
        return context;
      },
    },
  };
}
for (const example of editorExamples)
  test(`real GPU: editor captures and translates ${example.id}`, () =>
    checked(async () => {
      const { target, canvas } = editorCanvas();
      const session = await buildExample(example.setup, canvas, device);
      const drafts = new Map(
        session.records.flatMap((record) =>
          record.shaders.map((shader) => [shader.id, shader.source]),
        ),
      );
      const preview = translateDrafts(session.records, drafts);
      assert.deepEqual(preview.errors, []);
      for (const entry of preview.shaders) {
        const actual = session.records
          .flatMap((record) => record.shaders)
          .find((shader) => shader.id === entry.id);
        // Compare reflected locations; whitespace and generated stage order may differ.
        assert.deepEqual(
          [...entry.code.matchAll(/@group\((\d+)\) @binding\((\d+)\)/g)].map(
            (m) => m[0],
          ),
          [...actual.code.matchAll(/@group\((\d+)\) @binding\((\d+)\)/g)].map(
            (m) => m[0],
          ),
        );
      }
      await session.demo.frame?.(1000);
      const rebuiltTarget = editorCanvas();
      const rebuilt = await buildExample(
        example.setup,
        rebuiltTarget.canvas,
        device,
        drafts,
      );
      assert.equal(
        rebuilt.records.flatMap((record) => record.shaders).length,
        drafts.size,
      );
      await rebuilt.demo.frame?.(1500);
      disposeExample(session);
      disposeExample(rebuilt);
      target.destroy();
      rebuiltTarget.target.destroy();
    }));
test("real GPU: editor rebuilds changed source, rejects bad WGSL, and preserves working session", () =>
  checked(async () => {
    const definition = editorExamples.find(
      (example) => example.id === "triangle",
    );
    const firstTarget = editorCanvas(),
      first = await buildExample(definition.setup, firstTarget.canvas, device);
    const drafts = new Map(
      first.records.flatMap((record) =>
        record.shaders.map((shader) => [shader.id, shader.source]),
      ),
    );
    drafts.set("0:fragment", "()=>vec4f(0,1,0,1)");
    const secondTarget = editorCanvas(),
      second = await buildExample(
        definition.setup,
        secondTarget.canvas,
        device,
        drafts,
      );
    await second.demo.frame();
    const pixels = await first.helpers[0].vertex.getOutputData(
      device.createCommandEncoder(),
      { pixels: secondTarget.target },
    );
    assert.ok(pixels.some((v, i) => i % 4 === 1 && v > 200));
    const restored = WebGPUjs.createPipeline;
    drafts.set("0:fragment", "()=>vec4f(unknownShaderSymbol)");
    const failedTarget = editorCanvas();
    await assert.rejects(
      buildExample(definition.setup, failedTarget.canvas, device, drafts),
      /unknownShaderSymbol|unresolved|Pass/,
    );
    assert.equal(WebGPUjs.createPipeline, restored);
    await first.demo.frame();
    await second.demo.frame();
    disposeExample(first);
    disposeExample(second);
    firstTarget.target.destroy();
    secondTarget.target.destroy();
    failedTarget.target.destroy();
  }));

test("real GPU: texture-chain editor can replace sampling with a constant colour", () =>
  checked(async () => {
    const definition = editorExamples.find(
      (example) => example.id === "texture-chain",
    );
    const firstTarget = editorCanvas(),
      baseline = await buildExample(
        definition.setup,
        firstTarget.canvas,
        device,
      );
    const drafts = new Map(
      baseline.records.flatMap((record) =>
        record.shaders.map((shader) => [shader.id, shader.source]),
      ),
    );
    drafts.set(
      "1:fragment",
      "function textureFragment(){return vec4f(0,1,0,1);}",
    );
    const secondTarget = editorCanvas(),
      changed = await buildExample(
        definition.setup,
        secondTarget.canvas,
        device,
        drafts,
      );
    await changed.demo.frame(1000);
    const result = await baseline.helpers[0].compute.getOutputData(
      device.createCommandEncoder(),
      { target: secondTarget.target },
    );
    assert.ok(result.some((value, index) => index % 4 === 1 && value === 255));
    assert.equal(changed.records.flatMap((record) => record.shaders).length, 4);
    disposeExample(baseline);
    disposeExample(changed);
    firstTarget.target.destroy();
    secondTarget.target.destroy();
  }));

test("real GPU: compute chain shares names, ignores intermediate returns, serializes runs and reads integer aliases", () =>
  checked(async () => {
    function twice(values = "array<u32>") {
      const i = threadId.x;
      if (i < values.length) values[i] *= 2;
      return values;
    }
    function add(offset = "u32", renamed = "array<u32>") {
      const i = threadId.x;
      if (i < renamed.length) renamed[i] += offset;
      return renamed;
    }
    const chain = await WebGPUjs.createComputeChain(
      [
        twice,
        {
          shader: add,
          resources: { renamed: "values" },
          inputs: { offset: 3 },
        },
      ],
      { device },
    );
    let copies = 0;
    for (const pass of chain.passes) {
      const original = pass.compute.getOutputData;
      pass.compute.getOutputData = (...args) => {
        copies++;
        return original(...args);
      };
    }
    assert.equal(
      await chain.run({ values: new Uint32Array([1, 2, 3]) }),
      undefined,
    );
    assert.equal(copies, 0, "returned buffers must stay on GPU inside a chain");
    assert.deepEqual(Array.from(await chain.read("values")), [5, 7, 9]);
    assert.equal(copies, 1);
    assert.equal(
      chain.getBuffer("values"),
      chain.passes[0].compute.bufferGroup.inputBuffers.values,
    );
    const a = chain.run(
      { values: new Uint32Array([4, 5]) },
      { readback: "values" },
    );
    const b = chain.run(
      { values: new Uint32Array([10, 11]) },
      { readback: "values" },
    );
    assert.deepEqual(Array.from(await a), [11, 13]);
    assert.deepEqual(Array.from(await b), [23, 25]);
    assert.ok((await chain.read("values")) instanceof Uint32Array);
    await assert.rejects(
      chain.run({ typo: new Uint32Array(1) }),
      /Unknown.*typo/,
    );
    assert.deepEqual(
      Array.from(await chain.read("values")),
      [23, 25],
      "failed input validation preserves the previous result",
    );
  }));

test("real GPU: chain configuration reports parameter typos and invalid reads copy nothing", () =>
  checked(async () => {
    function scale(values = "array<f32>", gain = "f32") {
      const i = threadId.x;
      if (i < values.length) values[i] *= gain;
      return values;
    }
    for (const [settings, message] of [
      [{ inputs: { gian: 2 } }, /Pass 1: unknown uniform "gian".*values, gain/],
      [
        { resources: { vlaues: "data" } },
        /Pass 1: unknown resource parameter "vlaues".*values, gain/,
      ],
      [
        { resources: { values: "" } },
        /Pass 1: resource "values" needs a non-empty shared name/,
      ],
      [
        { inputs: { values: new Float32Array(2) } },
        /Pass 1: pass inputs only configure uniforms.*run/,
      ],
    ])
      await assert.rejects(
        WebGPUjs.createComputeChain([{ shader: scale, ...settings }], {
          device,
        }),
        message,
      );
    const chain = await WebGPUjs.createComputeChain(
      [
        { shader: scale, resources: { values: "signal" }, inputs: { gain: 0 } },
        { shader: scale, resources: { values: "signal" }, inputs: { gain: 3 } },
      ],
      { device },
    );
    await chain.run({ signal: new Float32Array([4, 5]), gain: 100 });
    let copies = 0;
    for (const pass of chain.passes) {
      const read = pass.compute.getOutputData.bind(pass.compute);
      pass.compute.getOutputData = (...args) => {
        copies++;
        return read(...args);
      };
    }
    await assert.rejects(
      chain.read(["signal", "typo"]),
      /Unknown.*typo.*Available buffers: signal/,
    );
    assert.equal(
      copies,
      0,
      "a partially valid read request must not start a GPU copy",
    );
    await assert.rejects(
      chain.run({ singal: new Float32Array(2) }),
      /Unknown.*singal.*Available inputs: signal, gain/,
    );
    assert.deepEqual(
      Array.from(await chain.read("signal")),
      [0, 0],
      "fixed per-pass uniforms, including zero, override run values",
    );
  }));

test("real GPU: arbitrary-length compute chain reuses group zero and validates allocations before dispatch", () =>
  checked(async () => {
    function step(data = "array<f32>") {
      const i = threadId.x;
      if (i < data.length) data[i] += 1;
      return data;
    }
    const chain = await WebGPUjs.createComputeChain(
      Array.from({ length: 12 }, () => step),
      { device },
    );
    await assert.rejects(chain.run(), /Missing.*data/);
    const values = await chain.run(
      { data: new Float32Array([0, 1]) },
      { readback: ["data"] },
    );
    assert.deepEqual(Array.from(values.data), [12, 13]);
    assert.ok(
      chain.passes.every((p) =>
        p.compute.resources.every((r) => r.group === 0),
      ),
    );
  }));

test("real GPU: FFT magnitudes, filtered inverse FFT and FIR agree with CPU references", () =>
  checked(async () => {
    const { extraCatalog } = await import("../example/extra-examples.js");
    const { signalSamples } = await import("../example/signal-examples.js");
    for (const id of ["fft", "spectral", "fir"]) {
      const { canvas, target } = editorCanvas();
      const definition = extraCatalog.find((d) => d.id === id);
      const demo = await definition.setup(definition, canvas, device);
      const settings = {
        frequency: 7,
        noise: 0.3,
        window: 0,
        cutoff: 18,
        radius: 5,
        gain: 1.5,
      };
      await demo.frame(0, settings);
      const actual = demo.result;
      const input = signalSamples(256, 7, 0.3);
      assert.ok(actual.every(Number.isFinite));
      if (id === "fft") {
        assert.ok(Math.abs(actual[7] - 1.2) < 0.0001);
        assert.ok(Math.abs(actual[53] - 0.6) < 0.0001);
        assert.ok(actual[20] < 0.0001);
      } else if (id === "spectral") {
        const expected = signalSamples(256, 7, 0);
        assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 0.0001));
      } else {
        const expected = Array.from(input, (_, i) => {
          let sum = 0,
            weight = 0;
          for (let j = -5; j <= 5; j++) {
            const tap = 6 - Math.abs(j);
            sum += input[Math.max(0, Math.min(255, i + j))] * tap;
            weight += tap;
          }
          return (sum / weight) * 1.5;
        });
        assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 0.0001));
      }
      const pixels = await demo.pipelines[0].compute.getOutputData(
        device.createCommandEncoder(),
        { target },
      );
      assert.ok(
        pixels.some((v, i) => i % 4 !== 3 && v > 150),
        `${id} must draw bright signal pixels`,
      );
      target.destroy();
    }
  }));

test("real GPU: cloth stays finite and visibly spread after a long run and responds to dragging", () =>
  checked(async () => {
    const definition = catalog.find((d) => d.id === "cloth");
    const { canvas, target } = editorCanvas();
    const demo = await definition.setup(definition, canvas, device);
    for (let i = 0; i < 600; i++) await demo.frame(i * 20);
    const settled = await demo.readback();
    assert.ok(settled.every(Number.isFinite));
    let visible = 0;
    for (let i = 0; i < settled.length; i += 4)
      if (Math.abs(settled[i]) < 1 && Math.abs(settled[i + 1]) < 1.15)
        visible++;
    assert.ok(
      visible > 320,
      `${visible}/400 cloth vertices must remain near the view`,
    );
    for (let i = 600; i < 680; i++)
      await demo.frame(i * 20, { pointer: [0.7, 0.3], down: true, wind: 1 });
    const pulled = await demo.readback();
    assert.ok(pulled.every(Number.isFinite));
    assert.ok(
      pulled.some((v, i) => i % 4 < 2 && Math.abs(v - settled[i]) > 0.03),
    );
    const pixels = await demo.pipelines[0].compute.getOutputData(
      device.createCommandEncoder(),
      { target },
    );
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 150) bright++;
    assert.ok(
      bright > canvas.width * canvas.height * 0.1,
      "cloth must occupy a visible area",
    );
    target.destroy();
  }));

test("real GPU: game movement collects a crystal, lighting changes pixels, and reset restores position", () =>
  checked(async () => {
    const { createGame } = await import("../example/game-example.js");
    const { canvas, target } = editorCanvas();
    const demo = await createGame({}, canvas, device);
    await demo.frame(0);
    const controls = { target: [2.5, 0], walkSpeed: 5 };
    for (let i = 1; i <= 50; i++) await demo.frame(i * 16, controls);
    assert.ok(demo.player[0] > 2);
    assert.ok(demo.score >= 1);
    const first = await demo.pipelines[0].compute.getOutputData(
      device.createCommandEncoder(),
      { target },
    );
    await demo.frame(816, { sun: 3.5 });
    const second = await demo.pipelines[0].compute.getOutputData(
      device.createCommandEncoder(),
      { target },
    );
    assert.ok(
      first.some((v, i) => i % 4 !== 3 && Math.abs(v - second[i]) > 20),
    );
    demo.reset();
    assert.equal(demo.score, 0);
    assert.deepEqual(demo.player, [0, 0, 0, 0]);
    demo.dispose();
    target.destroy();
  }));

test("real GPU: native WGSL and JavaScript share renamed integer buffers and independent uniform slots", () =>
  checked(async () => {
    const native = `struct Numbers { items: array<u32>, }; struct Factor { factor: u32, };
  @group(0) @binding(0) var<storage,read_write> nativeValues: Numbers;
  @group(0) @binding(1) var<uniform> settings: Factor;
  @compute @workgroup_size(64) fn compute_main(@builtin(global_invocation_id) id:vec3<u32>) {
    if(id.x<arrayLength(&nativeValues.items)){nativeValues.items[id.x]*=settings.factor;}
  }`;
    function prepare(values = "array<u32>", increment = "u32") {
      const i = threadId.x;
      if (i < values.length) values[i] += increment;
      return values;
    }
    function finish(result = "array<u32>") {
      const i = threadId.x;
      if (i < result.length) result[i] -= 1;
      return result;
    }
    const stages = [
      { shader: prepare, inputs: { increment: 2 } },
      {
        shader: native,
        resources: { nativeValues: "values" },
        inputs: { factor: 3 },
      },
      { shader: finish, resources: { result: "values" } },
    ];
    const before = stages.map((stage) =>
      JSON.stringify({
        inputs: stage.inputs,
        resources: stage.resources,
        options: stage.options,
      }),
    );
    const chain = await WebGPUjs.createComputeChain(stages, { device });
    const actual = await chain.run(
      { values: new Uint32Array([1, 2, 3]) },
      { readback: "values" },
    );
    assert.ok(actual instanceof Uint32Array);
    assert.deepEqual(Array.from(actual), [8, 11, 14]);
    assert.deepEqual(
      stages.map((stage) =>
        JSON.stringify({
          inputs: stage.inputs,
          resources: stage.resources,
          options: stage.options,
        }),
      ),
      before,
      "building never mutates caller stage definitions",
    );
    assert.equal(chain.passes[0].resources, chain.passes[1].resources);
    assert.equal(
      chain.passes[1].prototypes.compute.params.find(
        (p) => p.name === "nativeValues",
      ).type,
      "array<u32>",
    );
    const explicit = await WebGPUjs.createComputeChain(
      [
        {
          shader: native,
          resources: { nativeValues: "values" },
          inputs: { factor: 2 },
          options: {
            resourceBindings: { nativeValues: { group: 2, binding: 7 } },
          },
        },
      ],
      { device },
    );
    assert.deepEqual(
      Array.from(
        await explicit.run(
          { values: new Uint32Array([4, 5]) },
          { readback: "values" },
        ),
      ),
      [8, 10],
    );
    assert.equal(
      explicit.passes[0].prototypes.compute.resources.find(
        (r) => r.name === "nativeValues",
      ).binding,
      7,
    );
  }));

test("real GPU: every compute algorithm matches a CPU reference and changes with its controls", () =>
  checked(async () => {
    const { algorithmCatalog, algorithmReference } = await import(
      "../example/algorithm-examples.js"
    );
    for (const definition of algorithmCatalog) {
      const { canvas, target } = editorCanvas();
      const demo = await definition.setup(definition, canvas, device);
      for (const controls of [
        {},
        {
          amplitude: 2,
          threshold: 0.75,
          noise: 0.6,
          spread: 0.45,
          runWidth: 5,
          radius: 5,
        },
      ]) {
        await demo.frame(0, controls);
        const expected = algorithmReference(definition.mode, demo.input);
        if (definition.mode === "correlation") {
          const values = demo.results.correlation;
          assert.equal(values.indexOf(Math.max(...values)), 80);
          assert.ok(values[80] > 0.9);
        } else
          for (const [name, reference] of Object.entries(expected)) {
            const actual = demo.results[name];
            assert.ok(actual, `${definition.id}: ${name} exists`);
            if (definition.mode === "compact")
              assert.equal(demo.results.count[0], reference.length);
            if (definition.mode === "rle")
              assert.equal(demo.results.count[0], reference.length);
            assert.ok(
              reference.every((v, i) => Math.abs(v - actual[i]) < 0.0002),
              `${definition.id}: ${name} matches`,
            );
          }
        if (definition.mode === "spatial") {
          const slots = await demo.chain.read("slots"),
            seen = [];
          for (let bin = 0; bin < 64; bin++)
            for (let slot = 0; slot < demo.results.counts[bin]; slot++)
              seen.push(slots[bin * 512 + slot]);
          assert.deepEqual(
            seen.sort((a, b) => a - b),
            Array.from({ length: 512 }, (_, i) => i),
          );
        }
      }
      const pixels = await demo.pipelines[0].compute.getOutputData(
        device.createCommandEncoder(),
        { target },
      );
      assert.ok(
        pixels.some((v, i) => i % 4 !== 3 && v > 100),
        `${definition.id} draws useful pixels`,
      );
      target.destroy();
    }
  }));

test("real GPU: compute chain accepts preserved JavaScript source descriptors directly", () =>
  checked(async () => {
    const chain = await WebGPUjs.createComputeChain(
      [
        {
          code: '(data="array<f32>")=>{data[0]+=2;return data;}',
          transpileString: true,
        },
      ],
      { device },
    );
    assert.deepEqual(
      Array.from(
        await chain.run({ data: new Float32Array([3]) }, { readback: "data" }),
      ),
      [5],
    );
  }));

test("real GPU: 256 parallel 512 Hz channels preserve passband content and reject 60 Hz without CPU readback", () =>
  checked(async () => {
    const { createChannelFilterDemo } = await import(
      "../example/fft-examples.js"
    );
    const { canvas, target } = editorCanvas();
    const demo = await createChannelFilterDemo({}, canvas, device);
    let copies = 0;
    for (const pass of demo.pipelines) {
      const context = pass.compute || pass.fragment;
      const original = context.getOutputData.bind(context);
      context.getOutputData = (...args) => {
        copies++;
        return original(...args);
      };
    }
    await demo.frame(0);
    await demo.frame(0, { channel: 256 });
    assert.equal(
      copies,
      0,
      "computation and rendering use resident GPU buffers",
    );
    const output = await demo.chain.read(["signal", "notched", "filtered"]);
    let rawError = 0,
      notchError = 0,
      bandError = 0;
    for (let channel = 0; channel < 256; channel++)
      for (let sample = 0; sample < 1024; sample += 13) {
        const t = sample / 512,
          phase = channel * 0.17;
        const wanted =
          0.7 * Math.sin(2 * Math.PI * (10 + (channel % 24)) * t + phase) +
          0.25 * Math.sin(2 * Math.PI * 25 * t - phase);
        const outside =
          0.4 * Math.sin(2 * Math.PI * t) +
          0.3 * Math.sin(2 * Math.PI * 90 * t);
        const hum = 0.8 * Math.sin(2 * Math.PI * 60 * t + phase);
        const index = channel * 1024 + sample;
        rawError = Math.max(
          rawError,
          Math.abs(output.signal[index] - wanted - outside - hum),
        );
        notchError = Math.max(
          notchError,
          Math.abs(output.notched[index] - wanted - outside),
        );
        bandError = Math.max(
          bandError,
          Math.abs(output.filtered[index] - wanted),
        );
      }
    assert.ok(rawError < 0.0003, `raw generation error ${rawError}`);
    assert.ok(notchError < 0.0003, `notch reconstruction error ${notchError}`);
    assert.ok(bandError < 0.0003, `bandpass reconstruction error ${bandError}`);
    await demo.frame(0, { notchHz: 50, highHz: 100, lowHz: 0 });
    const moved = await demo.chain.read("filtered");
    assert.ok(
      moved.some((v, i) => Math.abs(v - output.filtered[i]) > 0.5),
      "moving the notch leaves the 60 Hz interference visible",
    );
    const pixels = await demo.pipelines[0].compute.getOutputData(
      device.createCommandEncoder(),
      { target },
    );
    assert.ok(pixels.some((v, i) => i % 4 !== 3 && v > 150));
    target.destroy();
  }));

test("real GPU: rectangular 2D FFT matches direct DFT bins and reconstructs a radial low-pass image", () =>
  checked(async () => {
    const { createFFTImageDemo } = await import("../example/fft-examples.js");
    const { canvas, target } = editorCanvas();
    const width = 32,
      height = 16;
    const demo = await createFFTImageDemo({ width, height }, canvas, device);
    await demo.frame(0, { stripeFrequency: 7, cutoff: 6 });
    const { image, spectrum, filtered } = await demo.chain.read([
      "image",
      "spectrum",
      "filtered",
    ]);
    for (const [kx, ky] of [
      [0, 0],
      [4, 0],
      [0, 6],
      [7, 7],
      [25, 9],
      [3, 2],
    ]) {
      let real = 0,
        imaginary = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const angle = -2 * Math.PI * ((kx * x) / width + (ky * y) / height);
          real += image[y * width + x] * Math.cos(angle);
          imaginary += image[y * width + x] * Math.sin(angle);
        }
      const at = (ky * width + kx) * 2;
      assert.ok(Math.abs(spectrum[at] - real) < 0.0002, `real bin ${kx},${ky}`);
      assert.ok(
        Math.abs(spectrum[at + 1] - imaginary) < 0.0002,
        `imaginary bin ${kx},${ky}`,
      );
    }
    for (let i = 0; i < filtered.length; i++) {
      const x = i % width,
        y = Math.floor(i / width);
      const wanted =
        0.5 +
        0.22 * Math.cos((2 * Math.PI * 4 * x) / width) +
        0.16 * Math.sin((2 * Math.PI * 6 * y) / height);
      assert.ok(Math.abs(filtered[i] - wanted) < 0.00001, `inverse pixel ${i}`);
    }
    await demo.frame(0, { stripeFrequency: 7, cutoff: 30 });
    const restored = await demo.chain.read("filtered");
    assert.ok(restored.every((v, i) => Math.abs(v - image[i]) < 0.00001));
    target.destroy();
  }));

test("real GPU: native entry point names and per-stage override constants", () =>
  checked(async () => {
    const native = `override multiplier:f32=1.0;
  @group(0) @binding(0) var<storage,read_write> samples:array<f32>;
  @compute @workgroup_size(64) fn runMain(@builtin(global_invocation_id) id:vec3<u32>){if(id.x<arrayLength(&samples)){samples[id.x]*=multiplier;}}`;
    const chain = await WebGPUjs.createComputeChain(
      [
        {
          shader: native,
          options: {
            entryPoints: { compute: "runMain" },
            constants: { compute: { multiplier: 7 } },
          },
        },
      ],
      { device },
    );
    assert.deepEqual(
      Array.from(
        await chain.run(
          { samples: new Float32Array([1, 2, 3]) },
          { readback: "samples" },
        ),
      ),
      [7, 14, 21],
    );
    const { canvas, target } = editorCanvas();
    const helper = await WebGPUjs.createPipeline(
      {
        vertex: `@vertex fn vertices(@builtin(vertex_index) index:u32)->@builtin(position) vec4<f32>{let p=array(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[index],0,1);}`,
        fragment: `override brightness:f32=1; @fragment fn colour()->@location(0) vec4<f32>{return vec4f(vec3f(brightness),1);}`,
      },
      {
        device,
        canvas,
        entryPoints: { vertex: "vertices", fragment: "colour" },
        constants: { fragment: { brightness: 0.6 } },
        renderPass: { vbos: [], vertexCount: 3 },
      },
    );
    await helper.render();
    const pixels = await helper.fragment.getOutputData(
      device.createCommandEncoder(),
      { target },
    );
    assert.ok(Math.abs(pixels[0] - 153) <= 1);
    assert.ok(Math.abs(pixels[1] - 153) <= 1);
    target.destroy();
  }));

// Media pixels can be consumed by arbitrary later compute passes without CPU conversion.
test("real GPU: media capture buffers feed luminance/Sobel and ASCII in one submission", () =>
  checked(async () => {
    const { setup } = await import("../example/demos/video-ascii/index.js");
    const { canvas, target } = editorCanvas();
    const demo = await setup(canvas, device, { width: 2, height: 2 });
    const submit = device.queue.submit.bind(device.queue);
    let submissions = 0;
    device.queue.submit = (...args) => {
      submissions++;
      return submit(...args);
    };
    try {
      await demo.frame(0);
    } finally {
      device.queue.submit = submit;
    }
    assert.equal(submissions, 1);
    const capture = demo.pipelines[0].compute;
    const pixels = await capture.getOutputData(device.createCommandEncoder(), {
      pixels: demo.getBuffer("pixels"),
    });
    assert.deepEqual(
      Array.from(pixels),
      [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1],
    );
    const features = await demo.pipelines[1].compute.getOutputData(
      device.createCommandEncoder(),
      { features: demo.getBuffer("features") },
    );
    const luma = [0.2126, 0.7152, 0.0722, 1];
    for (let i = 0; i < 4; i++) {
      assert.ok(Math.abs(features[i * 2] - luma[i]) < 0.00001);
      let gx = 0,
        gy = 0;
      for (let yy = -1; yy <= 1; yy++)
        for (let xx = -1; xx <= 1; xx++) {
          const x = Math.max(0, Math.min(1, (i % 2) + xx));
          const y = Math.max(0, Math.min(1, Math.floor(i / 2) + yy));
          gx += luma[y * 2 + x] * xx * (yy === 0 ? 2 : 1);
          gy += luma[y * 2 + x] * yy * (xx === 0 ? 2 : 1);
        }
      assert.ok(
        Math.abs(features[i * 2 + 1] - Math.min(1, Math.hypot(gx, gy))) <
          0.00001,
      );
    }
    demo.dispose();
    target.destroy();
  }));
