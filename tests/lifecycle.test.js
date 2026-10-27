import { isShaderSource, shaderDescriptor } from "../src/shader-source";
import { WebGPUjs } from "../src/pipeline";
import test from "node:test";
import assert from "node:assert/strict";
import {
  ResourceScope,
  withResourceInputs,
  ResourceRegistry,
  assertDeviceAvailable,
} from "../src/lifecycle";
import { BuiltinInputs, resolution } from "../src/builtin-inputs";
import { readGPUOutputs } from "../src/readback";

const allocation = () => ({
  destroyed: 0,
  destroy() {
    this.destroyed++;
  },
});
test("resource leases retain owned allocations across scopes and slots", () => {
  const a = new ResourceScope(),
    b = new ResourceScope(),
    owned = allocation();
  a.set("first", owned, true);
  a.set("second", owned);
  b.set("borrowed", owned);
  a.dispose();
  assert.equal(owned.destroyed, 0);
  b.dispose();
  assert.equal(owned.destroyed, 1);
  a.dispose();
  b.dispose();
  assert.equal(owned.destroyed, 1);
});
test("borrowed native allocations survive replacement and disposal", () => {
  const scope = new ResourceScope(),
    native = allocation(),
    owned = allocation();
  scope.set("buffer", native);
  scope.set("buffer", owned, true);
  assert.equal(native.destroyed, 0);
  scope.dispose();
  assert.equal(owned.destroyed, 1);
  assert.equal(native.destroyed, 0);
});
test("registries collect resources by consumer, keeping only allocations still used", () => {
  const registry = new ResourceRegistry(),
    a = {},
    b = {},
    shared = allocation(),
    privateBuffer = allocation();
  registry.attach(a, ["data", "scratch"]);
  registry.attach(b, ["data"]);
  for (const [id, buffer] of [
    ["data", shared],
    ["scratch", privateBuffer],
  ]) {
    const record = {};
    registry.buffer(id, record, buffer, true);
    registry.records.set(id, record);
  }
  registry.detach(a);
  assert.equal(privateBuffer.destroyed, 1);
  assert.equal(shared.destroyed, 0);
  assert.equal(registry.records.size, 1);
  registry.detach(b);
  assert.equal(shared.destroyed, 1);
  assert.equal(registry.records.size, 0);
});
test("registry replacement releases the old allocation and keeps a borrowed replacement intact", () => {
  const registry = new ResourceRegistry(),
    owner = {},
    record = {},
    old = allocation(),
    native = allocation();
  registry.attach(owner, ["data"]);
  registry.buffer("data", record, old, true);
  registry.buffer("data", record, native);
  assert.equal(old.destroyed, 1);
  registry.detach(owner);
  assert.equal(native.destroyed, 0);
});
test("device loss produces a specific error after notification", async () => {
  let lose;
  const device = { lost: new Promise((resolve) => (lose = resolve)) };
  assertDeviceAvailable(device);
  lose({ reason: "destroyed", message: "test loss" });
  await device.lost;
  assert.throws(
    () => assertDeviceAvailable(device),
    /device lost.*destroyed.*test loss/,
  );
});
test("automatic pointer uniforms preserve host handlers and detach on disposal", () => {
  const canvas = new EventTarget(),
    host = () => {};
  canvas.onpointermove = host;
  const first = new BuiltinInputs(canvas),
    second = new BuiltinInputs(canvas);
  const event = Object.assign(new Event("pointermove"), {
    offsetX: 12,
    offsetY: 34,
  });
  canvas.dispatchEvent(event);
  assert.equal(first.mouseX, 12);
  assert.equal(second.mouseY, 34);
  assert.equal(canvas.onpointermove, host);
  canvas.dispatchEvent(new Event("pointerdown"));
  assert.equal(first.clicked, 1);
  canvas.dispatchEvent(new Event("pointercancel"));
  assert.equal(first.clicked, 0);
  first.dispose();
  canvas.dispatchEvent(
    Object.assign(new Event("pointermove"), { offsetX: 56, offsetY: 78 }),
  );
  assert.equal(first.mouseX, 12);
  assert.equal(second.mouseX, 56);
  second.dispose();
  assert.equal(resolution({ width: 64 }, "width"), 64);
  assert.throws(() => resolution(undefined, "width"), /require a canvas/);
});
test("readback releases earlier staging allocations when a later copy throws", async () => {
  globalThis.GPUBufferUsage = { MAP_READ: 1, COPY_DST: 2 };
  const buffers = [];
  const device = {
    createBuffer() {
      const b = allocation();
      b.mapState = "unmapped";
      buffers.push(b);
      return b;
    },
    queue: {
      submit() {
        throw Error("must not submit");
      },
    },
  };
  let count = 0;
  const encoder = {
    copyBufferToBuffer() {
      if (++count === 2) throw Error("copy failed");
    },
  };
  await assert.rejects(
    readGPUOutputs(device, encoder, { a: { size: 4 }, b: { size: 4 } }, []),
    /copy failed/,
  );
  assert.equal(buffers.length, 2);
  assert.ok(buffers.every((b) => b.destroyed === 1));
});

test("shader source validation rejects malformed plans before requesting a device", async () => {
  assert.equal(isShaderSource(null), false);
  assert.equal(isShaderSource(42), false);
  assert.equal(isShaderSource({ code: "@compute ..." }), true);
  assert.throws(
    () => shaderDescriptor({ code: 42 }, "compute"),
    /Invalid compute shader/,
  );
  await assert.rejects(
    WebGPUjs.createComputeChain(null),
    /needs at least one shader/,
  );
  await assert.rejects(WebGPUjs.createComputeChain([null]), /Pass 1: provide/);
  await assert.rejects(
    WebGPUjs.createComputeChain([{ shader: { code: 42 } }]),
    /Invalid compute shader/,
  );
});

test("batched handle permutations keep every allocation alive until all slots are updated", () => {
  const scope = new ResourceScope(),
    a = Object.assign(allocation(), { mapAsync() {} }),
    b = Object.assign(allocation(), { mapAsync() {} });
  scope.set("in", a, true);
  scope.set("out", b, true);
  withResourceInputs([a, b], () => {
    scope.set("in", b);
    assert.equal(a.destroyed, 0);
    scope.set("out", a);
  });
  assert.equal(a.destroyed, 0);
  assert.equal(b.destroyed, 0);
  scope.dispose();
  assert.equal(a.destroyed, 1);
  assert.equal(b.destroyed, 1);
});
