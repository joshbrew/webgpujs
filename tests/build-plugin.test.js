import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { preserveShaderSources } from "../src/esbuild-plugin.mjs";
import { WGSLTranspiler } from "../src/transpiler";

test("public esbuild plugin preserves authored function/arrow/default exports through minification", async () => {
  const dir = await mkdtemp(join(tmpdir(), "webgpujs-plugin-"));
  try {
    const file = join(dir, "kernels.shaders.js");
    await writeFile(
      file,
      'export function gain(data="array<f32>",scale="f32"){data[0]*=scale;return data;} export const bias=(data="array<f32>")=>{data[0]+=1;return data;}; export default function final(data="array<f32>"){return data;}',
    );
    const result = await build({
      entryPoints: [file],
      bundle: true,
      minify: true,
      format: "esm",
      write: false,
      plugins: [preserveShaderSources()],
    });
    const kernels = await import(
      "data:text/javascript," + encodeURIComponent(result.outputFiles[0].text)
    );
    for (const shader of Object.values(kernels)) {
      assert.equal(shader.transpileString, true);
      const compiled = WGSLTranspiler.convertToWebGPU(shader.code);
      assert.equal(compiled.params[0].name, "data");
    }
    assert.match(kernels.gain.code, /function gain\(data=/);
  } finally {
    const target = resolve(dir),
      root = resolve(tmpdir());
    if (
      !target.startsWith(root + sep) ||
      !basename(target).startsWith("webgpujs-plugin-")
    )
      throw new Error("Unexpected fixture cleanup path");
    await rm(target, { recursive: true, force: true });
  }
});
test("public esbuild plugin supports selecting shader exports beside callable host helpers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "webgpujs-plugin-"));
  try {
    const file = join(dir, "selected.js");
    await writeFile(
      file,
      'export const count=3; export function host(){return 7;} function shader(data="array<f32>"){return data;} export {shader as kernel}; export default shader;',
    );
    const result = await build({
      entryPoints: [file],
      bundle: true,
      minify: true,
      format: "esm",
      write: false,
      plugins: [
        preserveShaderSources({
          filter: /selected\.js$/,
          exports: ["kernel", "default"],
        }),
      ],
    });
    const kernels = await import(
      "data:text/javascript," + encodeURIComponent(result.outputFiles[0].text)
    );
    assert.equal(kernels.host(), 7);
    assert.equal(kernels.count, 3);
    assert.equal(kernels.kernel.transpileString, true);
    assert.equal(kernels.default, kernels.kernel);
  } finally {
    const target = resolve(dir),
      root = resolve(tmpdir());
    if (
      !target.startsWith(root + sep) ||
      !basename(target).startsWith("webgpujs-plugin-")
    )
      throw new Error("Unexpected fixture cleanup path");
    await rm(target, { recursive: true, force: true });
  }
});
