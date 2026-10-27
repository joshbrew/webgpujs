import test, { after } from "node:test";
import assert from "node:assert/strict";
import { create, globals } from "webgpu";
import { WebGPUjs } from "../src/pipeline";
Object.assign(globalThis, globals);
const gpu = create([]);
navigator.gpu = gpu;
const adapter = await gpu.requestAdapter(),
  device = await adapter.requestDevice(),
  errors = [];
device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
after(() => {
  device.destroy();
  assert.deepEqual(errors, []);
});
async function checked(fn) {
  device.pushErrorScope("validation");
  try {
    await fn();
  } finally {
    await device.queue.onSubmittedWorkDone();
    const error = await device.popErrorScope();
    assert.equal(error, null, error?.message);
  }
}
function trackAllocations() {
  const buffers = [],
    textures = [],
    originalBuffer = device.createBuffer,
    originalTexture = device.createTexture;
  const wrap = (resource, list) => {
    const entry = { resource, destroyed: 0 };
    list.push(entry);
    const destroy = resource.destroy.bind(resource);
    resource.destroy = () => {
      entry.destroyed++;
      destroy();
    };
    return resource;
  };
  device.createBuffer = (...args) =>
    wrap(originalBuffer.apply(device, args), buffers);
  device.createTexture = (...args) =>
    wrap(originalTexture.apply(device, args), textures);
  return {
    buffers,
    textures,
    restore() {
      device.createBuffer = originalBuffer;
      device.createTexture = originalTexture;
    },
    assertReleased() {
      assert.ok(
        [...buffers, ...textures].every((entry) => entry.destroyed === 1),
        JSON.stringify(
          [...buffers, ...textures].map((e) => ({
            size: e.resource.size,
            destroyed: e.destroyed,
          })),
        ),
      );
    },
  };
}
const increment = (data = "array<f32>") => {
  const i = threadId.x;
  if (i < data.length) data[i] += 1;
  return data;
};
function target(width = 16, height = 16) {
  let texture;
  const context = {
    configure() {},
    getCurrentTexture() {
      return texture;
    },
    unconfigure() {
      throw Error("borrowed context must stay configured");
    },
  };
  const canvas = {
    width,
    height,
    getContext() {
      return context;
    },
  };
  const resize = (w, h) => {
    texture?.destroy();
    canvas.width = w;
    canvas.height = h;
    texture = device.createTexture({
      size: [w, h],
      format: gpu.getPreferredCanvasFormat(),
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
  };
  resize(width, height);
  return {
    canvas,
    resize,
    get texture() {
      return texture;
    },
  };
}
test("GPU lifetime: cleanup preserves caller device and borrowed storage", () =>
  checked(async () => {
    const native = device.createBuffer({
      size: 12,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(native, 0, new Float32Array([1, 2, 3]));
    const first = await WebGPUjs.createPipeline(increment, { device });
    assert.deepEqual(Array.from(await first.process(native)), [2, 3, 4]);
    first.cleanup();
    first.dispose();
    assert.equal(first.disposed, true);
    assert.throws(() => first.process(), /disposed/);
    const second = await WebGPUjs.createPipeline(increment, { device });
    assert.deepEqual(Array.from(await second.process(native)), [3, 4, 5]);
    second.dispose();
    native.destroy();
  }));
test("GPU lifetime: linked helpers and independent borrowers retain their shared allocation", () =>
  checked(async () => {
    const tracking = trackAllocations();
    try {
      const first = await WebGPUjs.createPipeline(increment, { device });
      await first.process(new Float32Array([1, 2]));
      const linked = await WebGPUjs.combineShaders(increment, {}, first);
      const buffer = [...first.resources.values()].find((r) => r.buffer).buffer;
      const borrower = await WebGPUjs.createPipeline(increment, { device });
      borrower.compute.buffer({ inputs: { data: buffer } });
      first.dispose();
      assert.deepEqual(Array.from(await linked.process()), [3, 4]);
      linked.dispose();
      assert.deepEqual(Array.from(await borrower.process()), [4, 5]);
      borrower.dispose();
      tracking.assertReleased();
    } finally {
      tracking.restore();
    }
  }));
test("GPU lifetime: resizing storage repeatedly destroys each replaced owned buffer", () =>
  checked(async () => {
    const tracking = trackAllocations();
    try {
      const pipeline = await WebGPUjs.createPipeline(increment, { device });
      for (const size of [1, 17, 17, 257, 3, 1])
        assert.equal(
          (await pipeline.process(new Float32Array(size))).length,
          size,
        );
      pipeline.dispose();
      assert.equal(pipeline.resources.size, 0);
      tracking.assertReleased();
    } finally {
      tracking.restore();
    }
  }));
test("GPU lifetime: failed builds release allocations without changing the working parent", () =>
  checked(async () => {
    const first = await WebGPUjs.createPipeline(increment, { device });
    await first.process(new Float32Array([2, 4]));
    const tracking = trackAllocations();
    try {
      device.pushErrorScope("validation");
      await assert.rejects(
        WebGPUjs.combineShaders(
          "@group(0) @binding(0) var<storage,read_write> data:array<f32>; @compute @workgroup_size(1) fn compute_main(){data[0]=missingValue;}",
          { inputs: [new Float32Array([99, 99])] },
          first,
        ),
      );
      await device.popErrorScope();
      tracking.assertReleased();
      assert.deepEqual(Array.from(await first.process()), [4, 6]);
      assert.equal(first.disposed, false);
    } finally {
      tracking.restore();
      first.dispose();
    }
  }));
test("GPU lifetime: failed chain routing releases all earlier passes", () =>
  checked(async () => {
    const tracking = trackAllocations();
    try {
      await assert.rejects(
        WebGPUjs.createComputeChain(
          [
            {
              shader: increment,
              options: { inputs: [new Float32Array([1, 2])] },
            },
            { shader: increment, resources: { missing: "other" } },
          ],
          { device },
        ),
        /unknown resource parameter/,
      );
      tracking.assertReleased();
    } finally {
      tracking.restore();
    }
  }));
test("GPU lifetime: chain disposal finishes queued work and rejects later work", () =>
  checked(async () => {
    const chain = await WebGPUjs.createComputeChain([increment, increment], {
      device,
    });
    const submitted = chain.run(
        { data: new Float32Array([1, 2]) },
        { readback: "data" },
      ),
      read = chain.read("data"),
      closed = chain.dispose();
    assert.equal(chain.dispose(), closed);
    assert.equal(chain.disposed, true);
    await assert.rejects(chain.run(), /disposed/);
    await assert.rejects(chain.read("data"), /disposed/);
    assert.throws(() => chain.getBuffer("data"), /disposed/);
    assert.deepEqual(Array.from(await submitted), [3, 4]);
    assert.deepEqual(Array.from(await read), [3, 4]);
    await closed;
    assert.ok(chain.passes.every((p) => p.disposed));
  }));
test("GPU lifetime: renderer can keep using data after its producing chain is disposed", () =>
  checked(async () => {
    const chain = await WebGPUjs.createComputeChain([increment], { device });
    await chain.run({ data: new Float32Array([0]) });
    const view = target();
    const renderer = await WebGPUjs.combineShaders(
      (data = "array<f32>") => vec4f(vec3f(data[0]), 1),
      { canvas: view.canvas, renderPass: { vbos: [], vertexCount: 3 } },
      chain.passes[0],
    );
    await chain.dispose();
    await renderer.render();
    const pixels = await renderer.fragment.getOutputData(
      device.createCommandEncoder(),
      { image: view.texture },
    );
    assert.equal(pixels[0], 255);
    renderer.dispose();
    view.texture.destroy();
  }));
test("GPU lifetime: owned attachments resize and shared depth survives one helper being disposed", () =>
  checked(async () => {
    const view = target();
    const tracking = trackAllocations();
    try {
      const first = await WebGPUjs.createPipeline(
        () => vec4f(0.2, 0.6, 0.9, 1),
        {
          device,
          canvas: view.canvas,
          renderPipelineDescriptor: { multisample: { count: 4 } },
          renderPass: { vbos: [], vertexCount: 3 },
        },
      );
      await first.render();
      view.resize(32, 32);
      await first.render();
      const second = await WebGPUjs.createPipeline(
        () => vec4f(0.8, 0.3, 0.1, 1),
        {
          device,
          canvas: view.canvas,
          renderPipelineDescriptor: { multisample: { count: 4 } },
          renderPass: { vbos: [], vertexCount: 3 },
        },
      );
      second.fragment.depthTexture = first.fragment.depthTexture;
      first.dispose();
      await second.render();
      second.dispose();
      view.texture.destroy();
      tracking.assertReleased();
    } finally {
      tracking.restore();
    }
  }));
test("GPU lifetime: frozen vertex layouts, reusable index uploads and explicit index counts", () =>
  checked(async () => {
    const view = target();
    const tracking = trackAllocations();
    try {
      const layout = Object.freeze({ vertex: "vec4f" });
      const pipeline = await WebGPUjs.createPipeline(
        {
          vertex: () => {
            position = vertexIn;
          },
          fragment: () => vec4f(0.2, 0.8, 0.4, 1),
        },
        {
          device,
          canvas: view.canvas,
          renderPass: { vbos: [layout], vertexCount: 3 },
        },
      );
      pipeline.fragment.updateVBO(
        new Float32Array([-1, -1, 0, 1, 3, -1, 0, 1, -1, 3, 0, 1]),
      );
      const indices = new Uint16Array([0, 1, 2]);
      pipeline.fragment.updateVBO(indices, 0, 0, 0, undefined, true, "uint16");
      const original = pipeline.fragment.bufferGroup.indexBuffer;
      for (let i = 0; i < 5; i++)
        pipeline.fragment.updateVBO(
          indices,
          0,
          0,
          0,
          undefined,
          true,
          "uint16",
        );
      assert.equal(pipeline.fragment.bufferGroup.indexBuffer, original);
      pipeline.fragment.updateVBO(
        new Uint16Array([0, 1, 2, 0, 1, 2]),
        0,
        0,
        0,
        undefined,
        true,
        "uint16",
      );
      await pipeline.render({ indexCount: 3 });
      assert.equal(Object.hasOwn(layout, "__COUNT"), false);
      pipeline.dispose();
      tracking.assertReleased();
    } finally {
      tracking.restore();
      view.texture.destroy();
    }
  }));
test("GPU lifetime: submitted readback finishes after disposal and transferred staging buffers remain caller-owned", () =>
  checked(async () => {
    const p = await WebGPUjs.createPipeline(increment, { device });
    const pending = p.process(new Float32Array([2, 3]));
    p.dispose();
    assert.deepEqual(Array.from(await pending), [3, 4]);
    const q = await WebGPUjs.createPipeline(increment, { device });
    await q.process(new Float32Array([4, 5]));
    const data = [...q.resources.values()].find((r) => r.buffer).buffer;
    const staging = await q.compute.getOutputData(
      device.createCommandEncoder(),
      { data },
      true,
    );
    q.dispose();
    await staging.mapAsync(GPUMapMode.READ);
    assert.deepEqual(
      Array.from(new Float32Array(staging.getMappedRange())),
      [5, 6],
    );
    staging.unmap();
    staging.destroy();
  }));
test("GPU lifetime: lost devices fail clearly, and concurrent automatic factories share and renew a default device", async () => {
  const original = navigator.gpu,
    previous = WebGPUjs.device;
  let requests = 0;
  const helpers = [];
  navigator.gpu = {
    requestAdapter: async () => {
      requests++;
      return original.requestAdapter();
    },
  };
  WebGPUjs.device = undefined;
  let replacement;
  try {
    helpers.push(
      ...(await Promise.all(
        Array.from({ length: 4 }, () => WebGPUjs.createPipeline(increment)),
      )),
    );
    const shared = helpers[0].device;
    assert.ok(helpers.every((p) => p.device === shared));
    assert.equal(requests, 1);
    shared.destroy();
    await shared.lost;
    assert.throws(
      () => helpers[0].process(new Float32Array([1])),
      /device lost/,
    );
    replacement = await WebGPUjs.createPipeline(increment);
    assert.notEqual(replacement.device, shared);
    assert.equal(requests, 2);
    assert.deepEqual(
      Array.from(await replacement.process(new Float32Array([1]))),
      [2],
    );
  } finally {
    for (const helper of helpers) helper.dispose();
    replacement?.dispose();
    replacement?.device.destroy();
    WebGPUjs.device = previous;
    navigator.gpu = original;
  }
});

test("GPU API: native shader descriptors carry entry points and specialization defaults through chains and rebuilds", () =>
  checked(async () => {
    const source = {
      code: "override factor:f32=1; @group(0) @binding(0) var<storage,read_write> data:array<f32>; @compute @workgroup_size(64) fn transform(@builtin(global_invocation_id) id:vec3u){if(id.x<arrayLength(&data)){data[id.x]*=factor;}}",
      entryPoint: "transform",
      constants: { factor: 3 },
    };
    const chain = await WebGPUjs.createComputeChain([source], { device });
    assert.deepEqual(
      Array.from(
        await chain.run(
          { data: new Float32Array([1, 2]) },
          { readback: "data" },
        ),
      ),
      [3, 6],
    );
    await chain.dispose();
    const { buildExample, disposeExample } = await import(
      "../example/editor-session.js"
    );
    const setup = async () => ({
      pipelines: [
        await WebGPUjs.createPipeline(source, {
          device,
          constants: { compute: { factor: 4 } },
        }),
      ],
    });
    const session = await buildExample(setup, undefined, device);
    assert.equal(session.records[0].shaders[0].name, "transform");
    const drafts = new Map([["0:compute", source.code]]),
      rebuilt = await buildExample(setup, undefined, device, drafts);
    const pipeline = rebuilt.demo.pipelines[0];
    await pipeline.process(new Float32Array([2]));
    const data = [...pipeline.resources.values()].find(
      (record) => record.buffer,
    ).buffer;
    const output = await pipeline.compute.getOutputData(
      device.createCommandEncoder(),
      { data },
    );
    assert.deepEqual(Array.from(output), [8]);
    disposeExample(session);
    disposeExample(rebuilt);
  }));

test("GPU lifetime: owned texture swaps and borrowed native textures preserve their correct owners", () =>
  checked(async () => {
    const view = target(),
      native = device.createTexture({
        size: [2, 2],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
    const tracking = trackAllocations();
    try {
      const pixels = (colour) => ({
        width: 2,
        height: 2,
        buffer: new Uint8Array(Array.from({ length: 4 }, () => colour).flat()),
      });
      const pipeline = await WebGPUjs.createPipeline(
        {
          code: '(a="texture_2d<f32>",b="texture_2d<f32>")=>textureLoad(a,vec2i(0),0)*.75+textureLoad(b,vec2i(0),0)*.25',
          transpileString: true,
        },
        {
          device,
          canvas: view.canvas,
          renderPass: {
            vbos: [],
            vertexCount: 3,
            textures: {
              a: pixels([255, 0, 0, 255]),
              b: pixels([0, 255, 0, 255]),
            },
          },
        },
      );
      await pipeline.render();
      const before = await pipeline.fragment.getOutputData(
        device.createCommandEncoder(),
        { image: view.texture },
      );
      const descriptors = pipeline.fragment.resources.filter(
        (r) => r.kind === "texture",
      );
      const a = pipeline.resources.get(
          descriptors.find((r) => r.name === "a").resource,
        ).texture,
        b = pipeline.resources.get(
          descriptors.find((r) => r.name === "b").resource,
        ).texture;
      pipeline.fragment.updateTextures({ a: b, b: a });
      await pipeline.render();
      const after = await pipeline.fragment.getOutputData(
        device.createCommandEncoder(),
        { image: view.texture },
      );
      assert.notEqual(before[1], after[1]);
      pipeline.fragment.updateTextures({ a: native, b: native });
      pipeline.dispose();
      tracking.assertReleased();
      device.queue.writeTexture(
        { texture: native },
        new Uint8Array(16),
        { bytesPerRow: 8 },
        [2, 2],
      );
    } finally {
      tracking.restore();
      native.destroy();
      view.texture.destroy();
    }
  }));
test("GPU API: empty datasets fail before allocating misleading one-element storage", () =>
  checked(async () => {
    const pipeline = await WebGPUjs.createPipeline(increment, { device });
    assert.throws(
      () => pipeline.process(new Float32Array(0)),
      /cannot be empty/,
    );
    assert.deepEqual(
      Array.from(await pipeline.process(new Float32Array([1]))),
      [2],
    );
    pipeline.dispose();
  }));
