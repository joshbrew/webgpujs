import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Exercise an actual tarball in a separate consumer, without workspace type packages.
const root = resolve(".");
const destination = resolve(".temp/package-check");
const consumer = resolve(destination, "consumer");
const npm =
  process.env.npm_execpath ||
  resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const run = (args, cwd = root) =>
  execFileSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
await mkdir(consumer, { recursive: true });
execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
const [packed] = JSON.parse(
  run([
    npm,
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    destination,
  ]),
);
assert.ok(packed.files.some((file) => file.path === "dist/index.d.ts"));
assert.ok(packed.files.some((file) => file.path === "dist/webgpujs.esm.js"));
assert.ok(
  packed.files.every(
    (file) =>
      !/^(example|tests|src|scripts|node_modules|\.temp)\//.test(file.path),
  ),
  "Only release files belong in the tarball",
);
await writeFile(
  resolve(consumer, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
run(
  [
    npm,
    "install",
    ...(process.argv.includes("--offline") ? ["--offline"] : []),
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    resolve(destination, packed.filename),
  ],
  consumer,
);
await writeFile(
  resolve(consumer, "index.ts"),
  `import WebGPUjs, {
  WebGPUjs as Named, WGSLTranspiler, getMediaDimensions,
  type PipelineOptions, type ComputeChainStage, type ShaderSource,
  type StorageArray, type VertexBufferOptions, type ShaderInputs,
} from "webgpujs";

import {preserveShaderSources} from "webgpujs/esbuild";
const plugin=preserveShaderSources({exports:["kernel"]});
const registered:import("esbuild").Plugin=plugin;
void registered;
const source: ShaderSource = {code: 'function gain(values="array<f32>") { return values; }', transpileString:true};
const vertex: VertexBufferOptions = { vertices:new Float32Array(12), stepMode:"instance", position:"vec3f" };
const options: PipelineOptions = {
  computePipelineSettings:{label:"consumer compute pipeline"},
  workGroupSize:[8,8], computePass:{workgroupsX:4,workgroupsY:2},
  workgroupVariables:{scratch:"array<f32,64>"},
  resourceBindings:{values:{resource:"signal",group:0,binding:2}},
  shaderBindings:{fragment:{image:{resource:"frame"}}},
  renderPass:{vbos:[vertex],indexBuffer:new Uint16Array([0,1,2]),blendConstant:[1,0,0,1]},
  renderPipelineDescriptor:{multisample:{count:4},fragment:{targets:[{format:"rgba8unorm"}]}},
};
const stages: ComputeChainStage[] = [{shader:source,resources:{values:"signal"}}];
async function use(device:GPUDevice, video:HTMLVideoElement) {
  const helper = await WebGPUjs.createPipeline(source, {device});
  const inputs:ShaderInputs = {values:new Float32Array(32), image:video};
  const wrappedMedia:ShaderInputs = {image:{source:video}};
  await helper.compute?.run({inputs});
  await helper.process(undefined);
  helper.dispose();
  const alreadyDisposed:boolean=helper.disposed;
  const native:ShaderSource={code:"@compute @workgroup_size(1) fn custom(){}",entryPoint:"custom",constants:{gain:2}};
  void [alreadyDisposed,native];
  const chain = await WebGPUjs.createComputeChain(stages,{device});
  const submitted:Promise<void> = chain.run({signal:new Float32Array(32)});
  const one:Promise<StorageArray> = chain.run({}, {readback:"signal"});
  const many = await chain.read(["signal","scratch"] as const);
  const result:StorageArray = many.signal;
  // @ts-expect-error Named result keys are preserved.
  many.misspelled;
  // @ts-expect-error Host inputs must be data or resources, not functions.
  chain.run({signal:()=>1});
  const buffer:GPUBuffer = chain.getBuffer("signal");
  const dimensions:{width:number;height:number} = getMediaDimensions(video);
  const disposal:Promise<void>=chain.dispose();
  const closed:boolean=chain.disposed;
  void [submitted,one,result,buffer,dimensions,wrappedMedia,disposal,closed];
}
void [Named,WGSLTranspiler,options,use];
`,
);
const compiler = resolve("node_modules/typescript/bin/tsc");
for (const mode of ["bundler", "nodenext"]) {
  await writeFile(
    resolve(consumer, "tsconfig.json"),
    JSON.stringify({
      files: ["index.ts"],
      compilerOptions: {
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        types: [],
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: mode === "bundler" ? "ESNext" : "NodeNext",
        moduleResolution: mode,
      },
    }),
  );
  run([compiler, "--project", "tsconfig.json"], consumer);
  console.log(`Installed-package types: ${mode} passed`);
}
await writeFile(
  resolve(consumer, "runtime.mjs"),
  `import assert from 'node:assert/strict';
import WebGPUjs, {WebGPUjs as Named, WGSLTranspiler} from 'webgpujs';
assert.equal(WebGPUjs,Named);
assert.equal(typeof WebGPUjs.createComputeChain,'function');
const result=WGSLTranspiler.convertToWebGPU('function scale(values="array<f32>"){values[threadId.x]*=2;return values;}');
assert.match(result.code,/@compute/);
`,
);
run([resolve(consumer, "runtime.mjs")], consumer);
const installed = JSON.parse(
  await readFile(
    resolve(consumer, "node_modules/webgpujs/package.json"),
    "utf8",
  ),
);
assert.ok(
  !installed.dependencies?.["@webgpu/types"],
  "Use native TypeScript WebGPU declarations",
);

const { build } = await import("esbuild");
const { pathToFileURL } = await import("node:url");
const { preserveShaderSources: installedPlugin } = await import(
  pathToFileURL(resolve(consumer, "node_modules/webgpujs/dist/esbuild.js")).href
);
await writeFile(
  resolve(consumer, "kernels.shaders.js"),
  'export function kernel(data="array<f32>"){data[0]+=1;return data;}',
);
await writeFile(
  resolve(consumer, "app.js"),
  'import {WebGPUjs,WGSLTranspiler} from "webgpujs"; import {kernel} from "./kernels.shaders.js"; export {WebGPUjs}; export const compiled=WGSLTranspiler.convertToWebGPU(kernel.code);',
);
const bundled = await build({
  entryPoints: [resolve(consumer, "app.js")],
  bundle: true,
  format: "esm",
  minify: true,
  write: false,
  plugins: [installedPlugin()],
});
assert.match(bundled.outputFiles[0].text, /data.*array<f32>/);
await writeFile(
  resolve(consumer, "minified-app.mjs"),
  bundled.outputFiles[0].text,
);
const minifiedApp = await import(
  pathToFileURL(resolve(consumer, "minified-app.mjs")).href + "?" + Date.now()
);
assert.equal(typeof minifiedApp.WebGPUjs.createComputeChain, "function");
assert.equal(minifiedApp.compiled.params[0].name, "data");
assert.match(minifiedApp.compiled.code, /@compute/);
console.log(
  "Fully minified installed library + app + source-preservation plugin passed",
);
console.log(
  `Release tarball: ${packed.files.length} files, ${(packed.size / 1024).toFixed(0)} KiB packed; imports and transpilation passed`,
);
