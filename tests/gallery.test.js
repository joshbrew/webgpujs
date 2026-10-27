import test from "node:test";
import assert from "node:assert/strict";
import { createAnimationScheduler } from "../example/animation-scheduler.js";
import { exampleExport, exportFilename } from "../example/source-export.js";
import { galleryGroups } from "../example/gallery-catalog.js";
import { editorExamples } from "../example/editor-examples.js";
import { pipelineSources } from "../example/source-view.js";

test("source comparisons show shared allocation identities across aliases, but never across independent registries", () => {
  const registry = new Map();
  function pipeline(name, resource, resources = registry) {
    return {
      resources,
      prototypes: {
        compute: {
          code: "native shader",
          resources: [{ name, resource, kind: "buffer", type: "array<f32>" }],
        },
      },
    };
  }
  const sources = pipelineSources(
    pipeline("filtered", "shared"),
    pipeline("samples", "shared"),
    pipeline("samples", "shared", new Map()),
    pipeline("unrelated", "other"),
  );
  assert.deepEqual(sources[0].resources[0].sharedWith, [
    "Pass 2 / compute → samples",
  ]);
  assert.deepEqual(sources[1].resources[0].sharedWith, [
    "Pass 1 / compute → filtered",
  ]);
  assert.deepEqual(sources[2].resources[0].sharedWith, []);
  assert.deepEqual(sources[3].resources[0].sharedWith, []);
  assert.equal(sources[0].language, "wgsl");
  assert.equal(sources[0].name, "compute_main");
  assert.equal(sources[0].pass, 0);
  assert.equal(sources[0].stage, "compute");
});

test("native shader labels use the actual stage defaults and custom entry points", () => {
  const sources = pipelineSources({
    options: { entryPoints: { vertex: "drawVertices" } },
    resources: new Map(),
    prototypes: { vertex: { code: "vertex" }, fragment: { code: "fragment" } },
  });
  assert.equal(sources[0].name, "drawVertices");
  assert.equal(sources[1].name, "frag_main");
  assert.match(sources[0].label, /drawVertices \(WGSL\)/);
});
test("contents groups cover all 100 examples exactly once", () => {
  const ids = galleryGroups.flatMap((group) => group.examples);
  assert.equal(ids.length, 100);
  assert.equal(new Set(ids).size, 100);
  assert.deepEqual(
    [...ids].sort(),
    editorExamples.map((example) => example.id).sort(),
  );
});
function harness() {
  const callbacks = new Map();
  let id = 0;
  const errors = [];
  const scheduler = createAnimationScheduler({
    requestFrame: (cb) => {
      callbacks.set(++id, cb);
      return id;
    },
    cancelFrame: (id) => callbacks.delete(id),
    onError: (e) => errors.push(e),
  });
  return {
    scheduler,
    callbacks,
    errors,
    async tick(time) {
      const entry = callbacks.entries().next().value;
      assert.ok(entry, "a frame is scheduled");
      callbacks.delete(entry[0]);
      await entry[1](time);
    },
  };
}
test("offscreen previews schedule no work and resume without advancing their clock", async () => {
  const h = harness(),
    times = [];
  const item = h.scheduler.add((time) => times.push(time));
  assert.equal(h.callbacks.size, 0);
  h.scheduler.setVisible(item, true);
  await h.tick(100);
  await h.tick(116);
  h.scheduler.setVisible(item, false);
  assert.equal(h.callbacks.size, 0);
  h.scheduler.setVisible(item, true);
  await h.tick(10000);
  await h.tick(10016);
  assert.deepEqual(times, [0, 16, 16, 32]);
});
test("user pause and hidden tab cancel work, including dirty static previews", async () => {
  const h = harness();
  let count = 0;
  const item = h.scheduler.add(() => count++, {
    visible: true,
    continuous: false,
  });
  h.scheduler.setPaused(true);
  assert.equal(h.callbacks.size, 0);
  h.scheduler.setPaused(false);
  await h.tick(100);
  assert.equal(count, 1);
  assert.equal(h.callbacks.size, 0);
  h.scheduler.setHidden(true);
  h.scheduler.invalidate(item);
  assert.equal(h.callbacks.size, 0);
  h.scheduler.setHidden(false);
  await h.tick(200);
  assert.equal(count, 2);
  assert.equal(h.callbacks.size, 0);
});
test("async frames are serialized and visibility changes take effect before the next preview", async () => {
  const h = harness(),
    calls = [];
  let release;
  h.scheduler.add(
    async () => {
      calls.push("first");
      await new Promise((resolve) => (release = resolve));
    },
    { visible: true },
  );
  const second = h.scheduler.add(() => calls.push("second"), { visible: true });
  const tick = h.tick(0);
  await Promise.resolve();
  assert.equal(h.callbacks.size, 0);
  h.scheduler.setVisible(second, false);
  release();
  await tick;
  assert.deepEqual(calls, ["first"]);
  assert.equal(h.callbacks.size, 1);
});
test("failed previews stop while other visible previews continue", async () => {
  const h = harness();
  let count = 0;
  const broken = h.scheduler.add(
    () => {
      throw new Error("broken");
    },
    { visible: true },
  );
  h.scheduler.add(() => count++, { visible: true });
  await h.tick(0);
  await h.tick(16);
  assert.equal(broken.failed, true);
  assert.equal(h.errors.length, 1);
  assert.equal(count, 2);
});
test("shader exports preserve source, WGSL, host code and diagnostics", () => {
  const data = JSON.parse(
    exampleExport(
      "demo",
      [
        {
          label: "pass 1",
          js: "()=>1",
          wgsl: "fn main() {}",
          error: "draft error",
        },
      ],
      "setup()",
      "frame()",
    ),
  );
  assert.equal(data.shaders[0].javascript, "()=>1");
  assert.equal(data.shaders[0].error, "draft error");
  assert.equal(data.setup, "setup()");
  assert.equal(data.animate, "frame()");
  assert.equal(
    exportFilename("Pass 1 / vertex → draw", "wgsl"),
    "Pass-1-vertex-draw.wgsl",
  );
});
