import test from "node:test";
import assert from "node:assert/strict";
import { WGSLTranspiler as T } from "../src/transpiler";
import { linkBindings, reflectResources } from "../src/bindings";
import { uniformLayout } from "../src/data";
import { flattenArray, combineVertices, splitVertices } from "../src/util";

test("native uniform reflection keeps nested generics and explicit member layouts intact", () => {
  const source = `struct Settings { @align(32) value:f32, @size(16) gain:f32, nested:array<array<vec4f,2>,3>, }; @group(0) @binding(0) var<uniform> settings:Settings;`;
  assert.deepEqual(reflectResources(source)[0].fields, [
    { name: "value", type: "f32", align: 32 },
    { name: "gain", type: "f32", size: 16 },
    { name: "nested", type: "array<array<vec4<f32>,2>,3>" },
  ]);
  const layout = uniformLayout([
    { name: "value", type: "f32", align: 32 },
    { name: "gain", type: "f32", size: 16 },
    { name: "last", type: "vec2f" },
  ]);
  assert.deepEqual(
    layout.entries.map((field) => field.offset),
    [0, 4, 24],
  );
  assert.equal(layout.size, 32);
});

test("parses multiline defaults, comments, arrow expressions and nested indices", () => {
  const shader =
    T.convertToWebGPU(`(data = new Float32Array([1, 2]), indices = 'array<u32>') => {
        /* return fake; textureStore(fake, 0, 0) */
        const i = threadId.x;
        if (i < data.length) data[indices[i]] += 2;
        return data;
    }`);
  assert.deepEqual(
    shader.params.map((p) => p.name),
    ["data", "indices"],
  );
  assert.match(shader.code, /data.values\[indices.values\[i\]\] \+= 2/);
  assert.equal(shader.params[0].isModified, true);
  assert.equal(shader.resources[0].access, "read_write");
  assert.doesNotMatch(shader.code, /fake/);
  assert.match(
    T.convertToWebGPU("x => vec4f(x)", "fragment").code,
    /return vec4f\(uniforms.x\)/,
  );
});

test("resource and builtin replacement respects identifier boundaries and properties", () => {
  const shader = T.convertToWebGPU(`function f(gain='f32', data='array<f32>') {
        let gain_extra = 3;
        data[0] = gain + gain_extra + frame;
        { let gain = 4; data[1] = gain; }
        return data;
    }`);
  assert.match(shader.code, /uniforms.gain \+ gain_extra/);
  assert.match(shader.code, /data.values\[1\] = gain;/);
  assert.match(shader.code, /defaults.frame/);
  assert.doesNotMatch(shader.code, /uniforms.gain_extra/);
});

test("nested helper blocks preserve returns and never become compute outputs", () => {
  const shader = T.convertToWebGPU(`function f(data='array<f32>') {
        function helper(x='f32') { function square(y='f32') { return y*y; } if (x > 0) { return square(x); } return 0.0; }
        data[0] = helper(data[0]); return data;
    }`);
  assert.match(shader.code, /fn square\(y: f32\) -> f32/);
  assert.match(shader.code, /fn helper\(x: f32\) -> f32/);
  assert.deepEqual(shader.returnedVars, ["data"]);
});

test("local arrays, vectors, matrices, loops and strict comparisons emit WGSL", () => {
  const shader = T.convertToWebGPU(`function f(data='array<f32>') {
        let values = new Array(3).fill(vec2f(1,2));
        let ids = new Uint32Array(4);
        for(let i=0;i<3;i++){ if(i === 1) continue; data[i] = values[i].x; }
        return data;
    }`);
  assert.match(shader.code, /array<vec2<f32>, 3>/);
  assert.match(shader.code, /array<u32, 4>/);
  assert.match(shader.code, /i == 1/);
  assert.doesNotMatch(shader.code, /values.values|ids.values/);
});

test("independent compilations never inherit VBO names or mutate previous params", () => {
  const vertex = T.convertToWebGPU(
    "() => { position=vec4f(0,0,0,1); }",
    "vertex",
    0,
    64,
    [{ custom: "vec2f" }],
  );
  const compute = T.convertToWebGPU(
    '(custom="array<f32>") => { custom[0]=1; return custom; }',
  );
  assert.equal(compute.params[0].name, "custom");
  const snapshot = JSON.stringify(compute.params);
  T.convertToWebGPU(
    '(custom="array<f32>") => { return custom; }',
    "compute",
    1,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    compute.params,
  );
  assert.equal(JSON.stringify(compute.params), snapshot);
  assert.equal(vertex.params.length, 0);
});

test("implicit linking preserves argument order, code and numeric metadata", () => {
  const first = T.convertToWebGPU(
    '(a="array<f32>", b="array<f32>") => { a[0]=b[0]; return a; }',
  );
  const second = T.convertToWebGPU(
    '(b="array<f32>", c="array<f32>", a="array<f32>") => { c[0]=a[0]+b[0]; return c; }',
  );
  linkBindings([first, second]);
  assert.deepEqual(
    second.params.map((p) => p.name),
    ["b", "c", "a"],
  );
  assert.equal(second.params[0].binding, first.params[1].binding);
  assert.equal(second.params[2].binding, first.params[0].binding);
  assert.equal(second.params[1].binding, 2);
  assert.deepEqual(
    reflectResources(second.code).map((r) => [r.group, r.binding]),
    second.resources.map((r) => [r.group, r.binding]),
  );
});

test("explicit sparse slots alias differently named buffers and reserve slots before inference", () => {
  const first = T.convertToWebGPU(
    '(a="array<f32>") => { a[0]=1; return a; }',
    "compute",
    0,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { a: { group: 2, binding: 7, resource: "state" } },
  );
  const second = T.convertToWebGPU(
    '(scratch="array<f32>", renamed="array<f32>") => { return renamed; }',
    "compute",
    0,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { renamed: { group: 2, binding: 7, resource: "state" } },
  );
  linkBindings([first, second]);
  assert.equal(second.params[1].group, 2);
  assert.equal(second.params[1].binding, 7);
  assert.equal(second.resources[1].resource, first.resources[0].resource);
  assert.throws(
    () =>
      T.convertToWebGPU(
        '(x="f32")=>{}',
        "compute",
        0,
        64,
        [],
        [],
        undefined,
        undefined,
        0,
        undefined,
        { x: { binding: 4 } },
      ),
    /packed uniform/,
  );
});

test("shared texture allocation retains separate storage and sampled slots", () => {
  const first = T.convertToWebGPU(
    "()=>{textureStore(output,vec2i(threadId.xy),vec4f(1));}",
    "compute",
    0,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { output: { resource: "image" } },
  );
  const second = T.convertToWebGPU(
    "()=>textureLoad(input,vec2i(0),0)",
    "fragment",
    1,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { input: { resource: "image" } },
  );
  linkBindings([first, second]);
  assert.equal(first.resources[0].resource, second.resources[0].resource);
  assert.equal(first.resources[0].kind, "storageTexture");
  assert.equal(second.resources[0].kind, "texture");
  assert.notDeepEqual(
    [first.resources[0].group, first.resources[0].binding],
    [second.resources[0].group, second.resources[0].binding],
  );
});

test("implicit texture names share allocation while preserving different view types", () => {
  const writer = T.convertToWebGPU(
    "()=>{textureStore(image,vec2i(0),vec4f(1));}",
  );
  const reader = T.convertToWebGPU(
    "()=>textureLoad(image,vec2i(0),0)",
    "fragment",
    1,
    64,
    [],
  );
  linkBindings([writer, reader]);
  assert.equal(writer.resources[0].resource, reader.resources[0].resource);
  assert.notEqual(writer.resources[0].group, reader.resources[0].group);
  const mismatch = T.convertToWebGPU('(image="array<u32>")=>{}');
  assert.throws(
    () => linkBindings([mismatch], writer.resources),
    /incompatible/,
  );
});

test("conflicts, invalid slots and unsupported JS fail early with diagnostics", () => {
  const a = T.convertToWebGPU(
    '(a="array<f32>")=>{}',
    "compute",
    0,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { a: { binding: 0, resource: "one" } },
  );
  const b = T.convertToWebGPU(
    '(b="array<u32>")=>{}',
    "compute",
    0,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { b: { binding: 0, resource: "two" } },
  );
  assert.throws(() => linkBindings([a, b]), /collision/);
  assert.throws(() => T.convertToWebGPU("({x})=>x"), /destructuring/);
  assert.throws(
    () => T.convertToWebGPU("()=>{ let x = new Float64Array(4); }"),
    /Unsupported shader array/,
  );
  assert.throws(
    () => T.convertToWebGPU("()=>{ let x = true ? 1 : 0; }"),
    /Conditional expressions/,
  );
  const invalid = T.convertToWebGPU(
    '(a="array<f32>")=>{}',
    "compute",
    0,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { a: { binding: -1 } },
  );
  assert.throws(() => linkBindings([invalid]), /non-negative/);
});

test("WGSL reflection supports reversed attributes, whitespace, comments and multiple uniforms", () => {
  const resources =
    reflectResources(`// @group(9) @binding(9) var fake: sampler;
        struct U { x: f32, m: mat3x3<f32>, };
        @binding ( 7 )\n@group ( 2 ) var<uniform> u: U;
        @group(2) @binding(3) var tex: texture_2d<f32>;`);
  assert.deepEqual(
    resources.map((r) => [r.group, r.binding]),
    [
      [2, 7],
      [2, 3],
    ],
  );
  assert.deepEqual(
    resources[0].fields.map((f) => f.name),
    ["x", "m"],
  );
});

test("uniform alignment rounds up and pads matrix columns", () => {
  const layout = uniformLayout([
    { name: "x", type: "f32" },
    { name: "v", type: "vec3f" },
    { name: "m", type: "mat3x3f" },
    { name: "u", type: "u32" },
  ]);
  assert.deepEqual(
    layout.entries.map((e) => e.offset),
    [0, 16, 32, 80],
  );
  assert.equal(layout.size, 96);
});

test("vertex utility round trip and nested typed arrays", () => {
  assert.deepEqual(
    flattenArray([[1, 2], new Uint32Array([3, 4])]),
    [1, 2, 3, 4],
  );
  const values = combineVertices(
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10],
    [11, 12, 13],
  );
  assert.deepEqual(Array.from(splitVertices(values).colors), [5, 6, 7, 8]);
});

test("atomicLoad-only storage uses the read_write access required by WGSL", () => {
  const source =
    '(counts="array<atomic<u32>>",result="array<u32>")=>{result[threadId.x]=atomicLoad(counts[threadId.x]);}';
  const shader = T.convertToWebGPU(source);
  assert.equal(
    shader.resources.find((r) => r.name === "counts").access,
    "read_write",
  );
  assert.match(shader.code, /var<storage, read_write> counts/);
  assert.throws(
    () =>
      T.convertToWebGPU(
        source,
        "compute",
        0,
        64,
        [],
        [],
        undefined,
        undefined,
        0,
        undefined,
        { counts: { access: "read" } },
      ),
    /requires read_write/,
  );
});

test("explicit aliases can refer to earlier implicit names without creating empty allocations", () => {
  const first = T.convertToWebGPU('(result="array<f32>")=>{result[0]=.75;}');
  const previous = linkBindings([first]);
  const view = T.convertToWebGPU(
    '(values="array<f32>")=>vec4f(values[0])',
    "fragment",
    1,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { values: { resource: "result" } },
  );
  linkBindings([view], previous);
  assert.equal(
    view.resources.find((r) => r.name === "values").resource,
    first.resources.find((r) => r.name === "result").resource,
  );
  // A distinct explicit allocation with a different type stays independent.
  const integer = T.convertToWebGPU(
    '(other="array<u32>")=>{other[0]=1;}',
    "compute",
    2,
    64,
    [],
    [],
    undefined,
    undefined,
    0,
    undefined,
    { other: { resource: "result" } },
  );
  linkBindings([integer], previous);
  assert.equal(
    integer.resources.find((r) => r.name === "other").resource,
    "result",
  );
});
