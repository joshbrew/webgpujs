import test from "node:test";
import assert from "node:assert/strict";
import { transform } from "esbuild";
import { preserveExampleSource } from "../scripts/shader-sources.mjs";
import { sourceText } from "../example/host-source.js";
import { exampleExport } from "../example/source-export.js";
import { editorExamples } from "../example/editor-examples.js";

test("bundled examples retain authored setup and nested update source without changing execution", async () => {
  const fixture = `export function prepareSignal(values = "array<f32>") {
  values[threadId.x] *= 2;
}
export function createDemo(seed) {
  // Keep the explanation and the authored names.
  function frame(time) {
    // A readable update.
    return seed + time;
  }
  return {frame};
}`;
  const preserved = preserveExampleSource(fixture, "signal-examples.js");
  const built = await transform(preserved, { minify: true, format: "esm" });
  const module = await import(
    `data:text/javascript,${encodeURIComponent(built.code)}`
  );
  assert.equal(module.prepareSignal.transpileString, true);
  assert.match(module.prepareSignal.code, /values\[threadId.x\] \*= 2/);
  const demo = module.createDemo(3);
  assert.equal(demo.frame(4), 7);
  assert.match(
    sourceText(module.createDemo),
    /Keep the explanation and the authored names/,
  );
  assert.match(sourceText(demo.frame), /A readable update/);
  assert.doesNotMatch(
    sourceText(module.createDemo),
    /defineProperty|sourceCode/,
  );
  const exported = JSON.parse(
    exampleExport("demo", [], module.createDemo, demo.frame),
  );
  assert.equal(exported.setup, sourceText(module.createDemo));
  assert.equal(exported.animate, sourceText(demo.frame));
});

test("standalone demos expose their complete authored module and local shader imports", () => {
  const study = editorExamples.find(
    (example) => example.id === "newton",
  ).setupSource;
  assert.match(study, /import \{ newtonBasin \} from "\.\/shaders.js"/);
  assert.match(study, /export async function setup/);
  assert.doesNotMatch(study, /defineProperty|sourceCode|createFragmentDemo/);
  const matrix = editorExamples.find(
    (example) => example.id === "matrix",
  ).setupSource;
  assert.match(matrix, /mode: "matrix"/);
  assert.equal(matrix.match(/function createPlan\(/g).length, 1);
  assert.doesNotMatch(
    matrix,
    /defineProperty|sourceCode|Unknown algorithm|mode ===/,
  );
});
