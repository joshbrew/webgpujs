import { copyFile } from "node:fs/promises";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { preserveShaderSources } from "./shader-sources.mjs";
const shared = {
  entryPoints: ["index.ts"],
  bundle: true,
  target: "es2022",
  sourcemap: false,
  minify: true,
};
await build({ ...shared, format: "esm", outfile: "dist/webgpujs.esm.js" });
await build({
  entryPoints: ["src/esbuild-plugin.mjs"],
  outfile: "dist/esbuild.js",
  platform: "node",
  format: "esm",
  bundle: true,
  target: "node22",
  minify: true,
});
await copyFile("src/esbuild-plugin.d.ts", "dist/esbuild.d.ts");
await build({
  ...shared,
  format: "iife",
  globalName: "WebGPUjsModule",
  outfile: "dist/webgpujs.js",
  footer: { js: "globalThis.WebGPUjs = WebGPUjsModule.WebGPUjs;" },
});
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--emitDeclarationOnly"],
  { stdio: "inherit" },
);
await build({
  entryPoints: [
    "example/example.js",
    "example/editor.js",
    "example/standalone.js",
    "example/verify.js",
    "example/external-texture.js",
  ],
  outdir: "example/dist",
  bundle: true,
  format: "esm",
  minify: true,
  plugins: [preserveShaderSources],
  loader: { ".jpg": "file" },
});
