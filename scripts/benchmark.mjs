import { build } from "esbuild";
import { pathToFileURL } from "node:url";
await build({
  entryPoints: ["src/transpiler.ts"],
  bundle: true,
  format: "esm",
  outfile: ".temp/transpiler.mjs",
});
const { WGSLTranspiler: T } = await import(
  pathToFileURL(`${process.cwd()}/.temp/transpiler.mjs`)
);
const source = `(values='array<f32>', scale='f32') => {
    function wave(x='f32') { return sin(x)*cos(x*2); }
    const i=threadId.x;
    if(i<values.length) values[i]=wave(values[i])*scale;
    return values;
}`;
const count = 1000;
const cold = performance.now();
for (let i = 0; i < count; i++)
  T.convertToWebGPU(source.replace("const i=", `/*${i}*/const i=`));
console.log(
  `Unique sources: ${((performance.now() - cold) / count).toFixed(3)} ms per transpilation`,
);
T.convertToWebGPU(source);
const warm = performance.now();
for (let i = 0; i < count; i++) T.convertToWebGPU(source);
console.log(
  `Cached syntax: ${((performance.now() - warm) / count).toFixed(3)} ms per transpilation`,
);
