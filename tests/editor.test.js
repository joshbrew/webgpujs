import test from "node:test";
import assert from "node:assert/strict";
import { translateDrafts } from "../example/editor-session.js";
import { WebGPUjs } from "../src/pipeline";
import { editorExamples } from "../example/editor-examples.js";

const record = (index, previous, shaders, options = {}) => ({
  index,
  previous,
  options,
  shaders: Object.entries(shaders).map(([stage, source]) => ({
    id: `${index}:${stage}`,
    stage,
    source,
    label: stage,
  })),
});

test("editor lists all 100 existing example setups with unique identifiers", () => {
  assert.equal(editorExamples.length, 100);
  assert.equal(new Set(editorExamples.map((example) => example.id)).size, 100);
  assert.ok(
    editorExamples.every((example) => typeof example.setup === "function"),
  );
});
test("live translation updates all passes without making a GPU pipeline or evaluating source", () => {
  const original = WebGPUjs.createPipeline;
  const records = [
    record(0, -1, { compute: '(data="array<f32>")=>{data[0]=1;return data;}' }),
    record(1, 0, { compute: '(data="array<f32>")=>{data[0]+=2;return data;}' }),
  ];
  const result = translateDrafts(
    records,
    new Map([["0:compute", '(data="array<f32>")=>{data[0]=7;return data;}']]),
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.linked, true);
  assert.match(result.shaders[0].code, /= 7/);
  assert.equal(
    result.shaders[0].shader.params[0].resource,
    result.shaders[1].shader.params[0].resource,
  );
  assert.equal(WebGPUjs.createPipeline, original);
  assert.equal(globalThis.editorSourceRan, undefined);
  translateDrafts(
    [record(0, -1, { compute: "()=>{globalThis.editorSourceRan=1;}" })],
    new Map(),
  );
  assert.equal(globalThis.editorSourceRan, undefined);
});
test("syntax and cross-pass binding errors identify the edited shader", () => {
  const records = [
    record(0, -1, {
      vertex: "()=>{position=vec4f(0,0,0,1);}",
      fragment: "()=>vec4f(1)",
    }),
  ];
  const broken = translateDrafts(
    records,
    new Map([["0:fragment", "()=>{ return vec4f(; }"]]),
  );
  assert.equal(broken.linked, false);
  assert.equal(broken.errors[0].id, "0:fragment");
  assert.ok(broken.shaders.find((shader) => shader.id === "0:vertex").code);
  const mismatch = translateDrafts(
    [
      record(
        0,
        -1,
        { compute: '(a="array<f32>")=>{}' },
        { resourceBindings: { a: { binding: 0, resource: "a" } } },
      ),
      record(
        1,
        0,
        { compute: '(b="array<u32>")=>{}' },
        { resourceBindings: { b: { group: 0, binding: 0, resource: "b" } } },
      ),
    ],
    new Map(),
  );
  assert.equal(mismatch.linked, false);
  assert.match(mismatch.errors[0].message, /collision/);
});
test("removing texture usage leaves resource mapping options harmless", () => {
  const preview = translateDrafts(
    [
      record(
        0,
        -1,
        { fragment: "()=>vec4f(0,1,0,1)" },
        {
          shaderBindings: { fragment: { displayImage: { resource: "image" } } },
        },
      ),
    ],
    new Map(),
  );
  assert.deepEqual(preview.errors, []);
  assert.doesNotMatch(preview.shaders[0].code, /displayImage/);
});
