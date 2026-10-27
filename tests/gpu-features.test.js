import { demos } from "../example/demos/index.js";
import { disposeExample } from "../example/editor-session.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { create, globals } from "webgpu";
import { WebGPUjs } from "../src/pipeline";

Object.assign(globalThis, globals);
const gpu = create([]);
globalThis.navigator.gpu = gpu;
const adapter = await gpu.requestAdapter();
const features = ["timestamp-query", "shader-f16"].filter((name) =>
  adapter.features.has(name),
);
const device = await adapter.requestDevice({ requiredFeatures: features });
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
  try {
    await fn();
  } finally {
    const error = await device.popErrorScope();
    assert.equal(error, null, error?.message);
  }
}
function target(width = 32, height = 32) {
  const texture = device.createTexture({
    size: [width, height],
    format: gpu.getPreferredCanvasFormat(),
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const context = { configure() {}, getCurrentTexture: () => texture };
  return { texture, canvas: { width, height, getContext: () => context } };
}
async function pixels(helper, texture) {
  return (helper.fragment || helper.compute).getOutputData(
    device.createCommandEncoder(),
    { image: texture },
  );
}

test("GPU coverage: native texture mip uploads and explicit mip views", () =>
  checked(async () => {
    const texture = device.createTexture({
      size: [4, 4],
      format: "rgba8unorm",
      mipLevelCount: 2,
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    const helper = await WebGPUjs.createPipeline(
      {
        code: 'function mip(result="array<f32>"){if(threadId.x==0)result[0]=textureLoad(image,vec2i(1,1),0).x;return result;}',
        transpileString: true,
      },
      {
        device,
        textureViews: { image: { baseMipLevel: 1, mipLevelCount: 1 } },
      },
    );
    const data = new Uint8Array(16);
    for (let i = 0; i < 16; i += 4) {
      data[i] = 64;
      data[i + 3] = 255;
    }
    const result = await helper.compute.run({
      inputs: { result: new Float32Array(1) },
      textures: {
        image: { texture, width: 2, height: 2, mipLevel: 1, buffer: data },
      },
    });
    assert.ok(Math.abs(result[0] - 64 / 255) < 0.00001);
    texture.destroy();
  }));

test("GPU coverage: native @align/@size uniforms and feature-gated half floats", () =>
  checked(async () => {
    const source = `struct Settings { @align(32) value:f32, @size(16) gain:f32, last:vec2f, };
  @group(0) @binding(0) var<storage,read_write> result:array<f32>;
  @group(0) @binding(1) var<uniform> settings:Settings;
  @compute @workgroup_size(1) fn compute_main(){result[0]=settings.value+settings.gain+settings.last.x+settings.last.y;}`;
    const helper = await WebGPUjs.createPipeline(source, { device });
    await helper.compute.run({
      inputs: { result: new Float32Array(1), value: 2, gain: 3, last: [4, 5] },
    });
    assert.deepEqual(
      Array.from(
        await helper.compute.getOutputData(
          device.createCommandEncoder(),
          helper.compute.bufferGroup.inputBuffers,
        ),
      ),
      [14],
    );
    if (features.includes("shader-f16")) {
      const half = await WebGPUjs.createPipeline(
        function half(values = "array<f16>") {
          if (threadId.x == 0) {
            values[0] = f16(1.5);
            values[1] += f16(0.5);
          }
          return values;
        },
        { device },
      );
      assert.deepEqual(
        Array.from(await half.process(new Float32Array([0, 1]))),
        [0x3e00, 0x3e00],
      );
      assert.deepEqual(
        Array.from(await half.process(new Uint16Array([0, 0x3c00]))),
        [0x3e00, 0x3e00],
      );
    }
  }));

test("GPU coverage: compact vec3/matrix storage packing and named input updates", () =>
  checked(async () => {
    const helper = await WebGPUjs.createPipeline(
      {
        code: 'function vectors(values="array<vec3f>", scale="f32"){const i=threadId.x;if(i<values.length)values[i]*=scale;return values;}',
        transpileString: true,
      },
      { device },
    );
    const values = await helper.compute.run({
      inputs: { values: new Float32Array([1, 2, 3, 4, 5, 6]), scale: 2 },
    });
    assert.deepEqual(Array.from(values), [2, 4, 6, 8, 10, 12]);
    assert.equal(helper.compute.bufferGroup.inputBuffers.values.size, 32);
    assert.deepEqual(
      Array.from(await helper.compute.run({ inputs: { scale: 0.5 } })),
      [1, 2, 3, 4, 5, 6],
    );
    assert.throws(
      () => helper.compute.run({ inputs: { typo: 3 } }),
      /Unknown compute input.*typo/,
    );
    assert.throws(
      () => helper.compute.run({ inputs: { scale: 1 } }, undefined),
      /named inputs/,
    );
    const matrix = await WebGPUjs.createPipeline(
      function matrices(values = "array<mat3x3f,2>") {
        if (threadId.x < values.length) values[threadId.x] *= 2.0;
        return values;
      },
      { device },
    );
    const source = Float32Array.from({ length: 18 }, (_, i) => i + 1);
    const result = await matrix.process(source);
    assert.deepEqual(
      Array.from(result),
      Array.from(source, (v) => v * 2),
    );
    const { canvas, texture } = target();
    const render = await WebGPUjs.createPipeline(
      {
        code: 'function tint(color="vec4f"){return color;}',
        transpileString: true,
      },
      { device, canvas, renderPass: { vbos: [], vertexCount: 3 } },
    );
    await render.render({ inputs: { color: [0.2, 0.8, 0.5, 1] } });
    assert.ok((await pixels(render, texture))[1] > 180);
    texture.destroy();
  }));

test("GPU coverage: stencil masks, blend state and indexed indirect drawing", () =>
  checked(async () => {
    const { canvas, texture } = target();
    const mask = await WebGPUjs.createPipeline(() => vec4f(0, 0, 0, 1), {
      device,
      canvas,
      renderPipelineDescriptor: {
        depthStencil: {
          format: "depth24plus-stencil8",
          depthWriteEnabled: false,
          depthCompare: "always",
          stencilFront: { compare: "always", passOp: "replace" },
          stencilBack: { compare: "always", passOp: "replace" },
        },
      },
      renderPass: { vbos: [], vertexCount: 3 },
    });
    await mask.render({
      stencilReference: 1,
      scissorRect: { x: 8, y: 8, width: 16, height: 16 },
    });
    const draw = await WebGPUjs.createPipeline(() => vec4f(1, 0, 0, 1), {
      device,
      canvas,
      renderPipelineDescriptor: {
        depthStencil: {
          format: "depth24plus-stencil8",
          depthWriteEnabled: false,
          depthCompare: "always",
          stencilFront: { compare: "equal", passOp: "keep" },
          stencilBack: { compare: "equal", passOp: "keep" },
        },
      },
      renderPass: { vbos: [], indexBuffer: new Uint16Array([0, 1, 2]) },
    });
    draw.fragment.depthTexture = mask.fragment.depthTexture;
    draw.fragment.renderPassDescriptor.colorAttachments[0].loadOp = "load";
    draw.fragment.renderPassDescriptor.depthStencilAttachment.depthLoadOp =
      "load";
    draw.fragment.renderPassDescriptor.depthStencilAttachment.stencilLoadOp =
      "load";
    const args = device.createBuffer({
      size: 20,
      usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(args, 0, new Uint32Array([3, 1, 0, 0, 0]));
    await draw.render({ stencilReference: 1, indirect: { buffer: args } });
    const image = await pixels(draw, texture);
    assert.ok(image.slice(0, 3).every((v) => v === 0));
    assert.ok(
      image
        .slice((16 * 32 + 16) * 4, (16 * 32 + 16) * 4 + 3)
        .some((v) => v > 250),
    );
    const blend = await WebGPUjs.createPipeline(
      function tint(color = "vec4f") {
        return color;
      },
      {
        device,
        canvas,
        renderPipelineDescriptor: {
          fragment: {
            targets: [
              {
                format: gpu.getPreferredCanvasFormat(),
                blend: {
                  color: {
                    srcFactor: "src-alpha",
                    dstFactor: "one-minus-src-alpha",
                  },
                  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
                },
              },
            ],
          },
        },
        renderPass: { vbos: [], vertexCount: 3 },
      },
    );
    await blend.render({}, [1, 0, 0, 1]);
    blend.fragment.renderPassDescriptor.colorAttachments[0].loadOp = "load";
    await blend.render({}, [0, 1, 0, 0.5]);
    const mixed = await pixels(blend, texture);
    assert.ok(Math.abs(mixed[1] - 128) <= 1);
    assert.ok(
      Math.abs(
        mixed[gpu.getPreferredCanvasFormat().startsWith("bgra") ? 2 : 0] - 128,
      ) <= 1,
    );
    args.destroy();
    texture.destroy();
  }));

test("GPU coverage: dynamic storage offsets and explicitly packed native uniform structures", () =>
  checked(async () => {
    const storage = device.createBuffer({
      size: 512,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
    const helper = await WebGPUjs.createPipeline(
      {
        code: 'function write(values="array<u32>"){if(threadId.x==0)values[0]=9;}',
        transpileString: true,
      },
      {
        device,
        bindings: {
          values: {
            buffer: { type: "storage", hasDynamicOffset: true },
            resource: { buffer: storage, size: 256 },
          },
        },
      },
    );
    await helper.compute.run({ dynamicOffsets: { 0: [256] }, workgroupsX: 1 });
    const values = await helper.compute.getOutputData(
      device.createCommandEncoder(),
      { values: storage },
    );
    assert.equal(values[0], 0);
    assert.equal(values[64], 9);
    const settings = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      settings,
      0,
      new Float32Array([1, 2, 3, 2, 0, 0, 0, 0, 0, 7, 0, 0]),
    );
    const native = `struct Inner { offset:vec3f, gain:f32, }; struct Settings { inner:Inner, weights:array<vec4f,2>, };
  @group(0) @binding(0) var<storage,read_write> result:array<f32>;
  @group(0) @binding(1) var<uniform> settings:Settings;
  @compute @workgroup_size(1) fn compute_main(){result[0]=settings.inner.offset.z*settings.inner.gain+settings.weights[1].y;}`;
    const packed = await WebGPUjs.createPipeline(native, {
      device,
      bindings: { settings: { resource: { buffer: settings } } },
    });
    await packed.process(new Float32Array(1));
    assert.deepEqual(
      Array.from(
        await packed.compute.getOutputData(
          device.createCommandEncoder(),
          packed.compute.bufferGroup.inputBuffers,
        ),
      ),
      [13],
    );
    storage.destroy();
    settings.destroy();
  }));

test("GPU coverage: typed 3D uploads, texture arrays and per-shader cube views", () =>
  checked(async () => {
    for (const [type, expression] of [
      ["texture_3d<u32>", "textureLoad(volume,vec3i(1,0,1),0).x"],
      ["texture_2d_array<u32>", "textureLoad(volume,vec2i(1,0),1,0).x"],
    ]) {
      const source = {
        code: `function sample(output="array<u32>"){output[0]=${expression};return output;}`,
        transpileString: true,
      };
      const helper = await WebGPUjs.createPipeline(source, {
        device,
        resourceBindings: { volume: { type } },
        renderPass: {
          textures: {
            volume: {
              width: 2,
              height: 2,
              depthOrArrayLayers: 2,
              format: "r32uint",
              buffer: new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]),
            },
          },
        },
      });
      assert.deepEqual(Array.from(await helper.process(new Uint32Array(1))), [
        6,
      ]);
    }
    const texels = new Uint8Array(2 * 2 * 6 * 4);
    for (let face = 0; face < 6; face++)
      for (let i = 0; i < 4; i++) {
        texels[(face * 4 + i) * 4 + (face % 3)] = 255;
        texels[(face * 4 + i) * 4 + 3] = 255;
      }
    const cube = await WebGPUjs.createPipeline(
      function cube(output = "array<f32>") {
        output[0] = textureSampleLevel(
          environment,
          linearSampler,
          vec3f(1, 0, 0),
          0,
        ).x;
        output[1] = textureSampleLevel(
          environment,
          linearSampler,
          vec3f(-1, 0, 0),
          0,
        ).y;
        return output;
      },
      {
        device,
        resourceBindings: { environment: { type: "texture_cube<f32>" } },
        textureViews: { environment: { dimension: "cube" } },
        renderPass: {
          textures: {
            environment: {
              width: 2,
              height: 2,
              depthOrArrayLayers: 6,
              buffer: texels,
            },
          },
        },
      },
    );
    assert.deepEqual(
      Array.from(await cube.process(new Float32Array(2))),
      [1, 1],
    );
  }));

test("GPU coverage: offscreen depth-only rendering feeds a JS depth-comparison shader", () =>
  checked(async () => {
    const depth = device.createTexture({
      size: [8, 8],
      format: "depth32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const vertex = `@vertex fn vtx_main(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {var positions=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(positions[index],0.25,1);}`;
    const first = await WebGPUjs.createPipeline(
      { vertex },
      {
        device,
        renderPipelineDescriptor: {
          depthStencil: {
            format: "depth32float",
            depthWriteEnabled: true,
            depthCompare: "less",
          },
        },
        renderPassDescriptor: {
          colorAttachments: [],
          depthStencilAttachment: {
            view: depth.createView(),
            depthLoadOp: "clear",
            depthClearValue: 1,
            depthStoreOp: "store",
          },
        },
        renderPass: { vbos: [], vertexCount: 3 },
      },
    );
    await first.render();
    const { canvas, texture } = target();
    const sample = await WebGPUjs.createPipeline(
      function shadow(
        shadowMap = "texture_depth_2d",
        compareSampler = "sampler_comparison",
        reference = "f32",
      ) {
        const visibility = textureSampleCompare(
          shadowMap,
          compareSampler,
          vec2f(0.5),
          reference,
        );
        return vec4f(vec3f(visibility), 1);
      },
      {
        device,
        canvas,
        renderPass: {
          vbos: [],
          vertexCount: 3,
          textures: { shadowMap: depth },
        },
      },
    );
    await sample.render({}, undefined, undefined, 0.1);
    assert.equal((await pixels(sample, texture))[0], 255);
    await sample.render({}, undefined, undefined, 0.5);
    assert.equal((await pixels(sample, texture))[0], 0);
    depth.destroy();
    texture.destroy();
  }));

test("GPU coverage: JS workgroup arrays, barriers and 2D/3D local shapes", () =>
  checked(async () => {
    function tile(output = "array<u32>", width = "u32") {
      scratch[localIndex] = threadId.x + threadId.y * width + threadId.z * 100;
      workgroupBarrier();
      if (localIndex == 0)
        output[workgroupId.y * workgroups.x + workgroupId.x] = scratch[7];
      return output;
    }
    const helper = await WebGPUjs.createPipeline(tile, {
      device,
      workGroupSize: [4, 2, 1],
      workgroupVariables: { scratch: "array<u32,8>" },
      computePass: { workgroupsX: 2, workgroupsY: 2 },
    });
    assert.deepEqual(
      Array.from(await helper.process(new Uint32Array(4), 8)),
      [11, 15, 27, 31],
    );
    const volume = await WebGPUjs.createPipeline(
      function volume(output = "array<u32>") {
        const i = threadId.z * 16 + threadId.y * 4 + threadId.x;
        output[i] = localIndex;
        return output;
      },
      {
        device,
        workGroupSize: [2, 2, 2],
        computePass: { workgroupsX: 2, workgroupsY: 2, workgroupsZ: 2 },
      },
    );
    const values = await volume.process(new Uint32Array(64));
    for (let z = 0; z < 4; z++)
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          assert.equal(
            values[z * 16 + y * 4 + x],
            (z % 2) * 4 + (y % 2) * 2 + (x % 2),
          );
  }));

test("GPU coverage: compute chains batch dispatches while retaining distinct per-pass uniforms", () =>
  checked(async () => {
    function multiply(values = "array<f32>", factor = "f32") {
      const i = threadId.x;
      if (i < values.length) values[i] *= factor;
      return values;
    }
    const stages = [2, 3, 4].map((factor) => ({
      shader: multiply,
      inputs: { factor },
    }));
    const chain = await WebGPUjs.createComputeChain(stages, { device });
    const submit = device.queue.submit.bind(device.queue);
    let submissions = 0;
    device.queue.submit = (...args) => {
      submissions++;
      return submit(...args);
    };
    try {
      await chain.run({ values: new Float32Array([1, 2]) });
      assert.equal(submissions, 1);
      assert.deepEqual(Array.from(await chain.read("values")), [24, 48]);
      const encoder = device.createCommandEncoder();
      const before = submissions;
      await chain.run(
        { values: new Float32Array([3, 4]) },
        { commandEncoder: encoder },
      );
      assert.equal(
        submissions,
        before,
        "caller-owned encoders are not submitted",
      );
      device.queue.submit([encoder.finish()]);
      assert.deepEqual(Array.from(await chain.read("values")), [72, 96]);
      await assert.rejects(
        chain.run(
          {},
          { commandEncoder: device.createCommandEncoder(), readback: "values" },
        ),
        /caller-owned/,
      );
      const shared = await WebGPUjs.createComputeChain(stages, {
        device,
        resourceBindings: {
          uniforms: { resource: "explicit-shared-settings" },
        },
      });
      assert.deepEqual(
        Array.from(
          await shared.run(
            { values: new Float32Array([1]) },
            { readback: "values" },
          ),
        ),
        [24],
      );
    } finally {
      device.queue.submit = submit;
    }
  }));

test("GPU coverage: GPU-generated indirect dispatch arguments and caller-owned encoders", () =>
  checked(async () => {
    const argumentsBuffer = device.createBuffer({
      size: 12,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.INDIRECT |
        GPUBufferUsage.COPY_DST,
    });
    const generate = await WebGPUjs.createPipeline(
      function generate(args = "array<u32>") {
        if (threadId.x == 0) {
          args[0] = 2;
          args[1] = 1;
          args[2] = 1;
        }
      },
      { device, computePass: { workgroupsX: 1, skipOutputDef: true } },
    );
    const consume = await WebGPUjs.createPipeline(
      function consume(values = "array<u32>") {
        if (threadId.x < values.length) values[threadId.x] = threadId.x + 7;
        return values;
      },
      { device },
    );
    const encoder = device.createCommandEncoder();
    await generate.compute.run(
      { commandEncoder: encoder, skipOutputDef: true, workgroupsX: 1 },
      argumentsBuffer,
    );
    await consume.compute.run(
      {
        commandEncoder: encoder,
        skipOutputDef: true,
        indirect: { buffer: argumentsBuffer },
      },
      new Uint32Array(128),
    );
    device.queue.submit([encoder.finish()]);
    const values = await consume.compute.getOutputData(
      device.createCommandEncoder(),
      consume.compute.bufferGroup.inputBuffers,
    );
    assert.deepEqual(
      Array.from(values),
      Array.from({ length: 128 }, (_, i) => i + 7),
    );
    argumentsBuffer.destroy();
  }));

test("GPU coverage: JS fragment objects write multiple offscreen color attachments", () =>
  checked(async () => {
    const targets = [0, 1].map(() =>
      device.createTexture({
        size: [8, 8],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      }),
    );
    const helper = await WebGPUjs.createPipeline(
      {
        fragment: function gbuffer() {
          return { albedo: vec4f(1, 0.25, 0, 1), normal: vec4f(0, 0.5, 1, 1) };
        },
      },
      {
        device,
        renderPipelineDescriptor: {
          depthStencil: undefined,
          fragment: {
            targets: [{ format: "rgba8unorm" }, { format: "rgba8unorm" }],
          },
        },
        renderPassDescriptor: {
          colorAttachments: targets.map((texture) => ({
            view: texture.createView(),
            loadOp: "clear",
            storeOp: "store",
          })),
        },
        renderPass: { vbos: [], vertexCount: 3 },
      },
    );
    await helper.render();
    const a = await pixels(helper, targets[0]),
      b = await pixels(helper, targets[1]);
    assert.deepEqual(Array.from(a.slice(0, 4)), [255, 64, 0, 255]);
    assert.ok(
      [0, 128, 255, 255].every((value, i) => Math.abs(b[i] - value) <= 1),
      "unorm8 conversion permits one level of rounding",
    );
    targets.forEach((texture) => texture.destroy());
  }));

test("GPU coverage: multisample resolve, indirect draw, viewport/scissor and occlusion queries", () =>
  checked(async () => {
    const { canvas, texture } = target();
    const helper = await WebGPUjs.createPipeline(
      () => vec4f(0.2, 0.8, 0.5, 1),
      {
        device,
        canvas,
        renderPipelineDescriptor: { multisample: { count: 4 } },
        renderPass: { vbos: [], vertexCount: 3 },
      },
    );
    const args = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(args, 0, new Uint32Array([3, 1, 0, 0]));
    const querySet = device.createQuerySet({ type: "occlusion", count: 1 });
    helper.fragment.renderPassDescriptor.occlusionQuerySet = querySet;
    const encoder = device.createCommandEncoder();
    await helper.render({
      commandEncoder: encoder,
      indirect: { buffer: args },
      useRenderBundle: true,
      occlusionQueryIndex: 0,
      viewport: { height: 32, width: 32, y: 0, x: 0 },
      scissorRect: { height: 16, y: 8, width: 16, x: 8 },
    });
    const resolved = device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const staging = device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    encoder.resolveQuerySet(querySet, 0, 1, resolved, 0);
    encoder.copyBufferToBuffer(resolved, 0, staging, 0, 8);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    assert.ok(new BigUint64Array(staging.getMappedRange())[0] > 0n);
    staging.unmap();
    const image = await pixels(helper, texture);
    assert.equal(image[0], 0, "scissor leaves the corner clear");
    assert.ok(
      image[(16 * 32 + 16) * 4 + 1] > 150,
      "MSAA resolves colored center pixels",
    );
    for (const resource of [texture, args, resolved, staging, querySet])
      resource.destroy();
  }));

test(
  "GPU coverage: timestamp descriptors compose with native query resolution",
  { skip: !features.includes("timestamp-query") },
  () =>
    checked(async () => {
      const helper = await WebGPUjs.createPipeline(
        function calculate(values = "array<f32>") {
          if (threadId.x < values.length) values[threadId.x] *= 2;
        },
        { device },
      );
      const querySet = device.createQuerySet({ type: "timestamp", count: 2 });
      const encoder = device.createCommandEncoder();
      await helper.compute.run(
        {
          commandEncoder: encoder,
          skipOutputDef: true,
          descriptor: {
            timestampWrites: {
              querySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          },
        },
        new Float32Array(1024).fill(1),
      );
      const resolved = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      const staging = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      encoder.resolveQuerySet(querySet, 0, 2, resolved, 0);
      encoder.copyBufferToBuffer(resolved, 0, staging, 0, 16);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const times = new BigUint64Array(staging.getMappedRange());
      assert.ok(times[1] >= times[0]);
      assert.ok(times[1] > 0n);
      staging.unmap();
      for (const resource of [resolved, staging, querySet]) resource.destroy();
    }),
);

const advancedIds = [
  "deferred-lighting",
  "stencil-portal",
  "shadow-map",
  "indirect-culling",
  "mesh-normals",
  "render-bundles",
  "occlusion-query",
  "timestamp-query",
  "half-precision",
  "mipmaps",
  "texture-array",
  "volume-texture",
  "cube-reflection",
];
for (const id of advancedIds)
  test(
    "GPU gallery: " +
      id +
      " produces visible pixels with optional features enabled",
    () =>
      checked(async () => {
        const { canvas, texture } = target(128, 64);
        const demo = await demos.find((d) => d.id === id).setup(canvas, device);
        try {
          await demo.frame(1000);
          const values = await pixels(demo.pipelines.at(-1), texture);
          assert.ok(
            values.some((v, i) => i % 4 !== 3 && v > 5),
            id + " blank output",
          );
          if (id === "occlusion-query") {
            assert.match(demo.resultInfo, /Visible:/);
            await demo.frame(2000, { offset: 2 });
            assert.match(demo.resultInfo, /Occluded:/);
          }
          if (id === "half-precision")
            assert.equal(demo.half, device.features.has("shader-f16"));
          if (id === "timestamp-query")
            assert.equal(
              demo.supported,
              device.features.has("timestamp-query"),
            );
          if (id === "indirect-culling") {
            await demo.frame(2000, { radius: 0.1 });
            const small = (await demo.chain.read("args"))[1];
            await demo.frame(3000, { radius: 1.5 });
            const large = (await demo.chain.read("args"))[1];
            assert.ok(
              small > 0 && small < large && large <= 2048,
              "GPU-generated instance counts track visibility",
            );
          }
        } finally {
          disposeExample({ demo, helpers: demo.pipelines });
          texture.destroy();
        }
      }),
  );
