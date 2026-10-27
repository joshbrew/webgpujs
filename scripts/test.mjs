import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { preserveShaderSources } from "./shader-sources.mjs";

const gpu = process.argv.includes("--gpu");
const files = (await readdir("tests")).filter(
  (f) =>
    f.endsWith(".test.js") &&
    (gpu ? f.startsWith("gpu") : !f.startsWith("gpu")),
);
await build({
  entryPoints: files.map((f) => `tests/${f}`),
  outdir: ".temp/tests",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  plugins: [preserveShaderSources],
  loader: { ".jpg": "file" },
});
const run = spawnSync(
  process.execPath,
  ["--test", ...files.map((f) => `.temp/tests/${f.replace(".js", ".mjs")}`)],
  { stdio: "inherit" },
);
process.exitCode = run.status ?? 1;
