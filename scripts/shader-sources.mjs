import { readFile } from "node:fs/promises";
import { parse } from "acorn";

// Bundlers may rename function parameters even without minification. Shader source
// is data: preserve the authored names before bundling host JavaScript around it.
const selected = {
  "game-example.js": new Set([
    "buildTerrain",
    "terrainVertex",
    "litFragment",
    "actorVertex",
  ]),
  "signal-examples.js": new Set([
    "prepareSignal",
    "fftPass",
    "spectrumPass",
    "lowPassBins",
    "reverseComplex",
    "realSignal",
    "firPass",
    "gainPass",
    "signalDisplay",
  ]),
};
const shaderModules = new Set([
  "shaders.js",
  "more-shaders.js",
  "extra-shaders.js",
  "algorithm-shaders.js",
  "fft-shaders.js",
]);

/** Preserve display text before bundling renames host variables and imports. */
export function preserveExampleSource(contents, file) {
  const ast = parse(contents, { ecmaVersion: "latest", sourceType: "module" });
  const edits = [];
  function visit(node) {
    if (!node || typeof node.type !== "string") return;
    if (
      node.type === "ExportNamedDeclaration" &&
      node.declaration?.type === "FunctionDeclaration"
    ) {
      const fn = node.declaration;
      if (shaderModules.has(file) || selected[file]?.has(fn.id.name)) {
        edits.push({
          start: node.start,
          end: node.end,
          text: `export const ${fn.id.name} = {code:${JSON.stringify(contents.slice(fn.start, fn.end))},transpileString:true};`,
        });
        return;
      }
    }
    if (node.type === "FunctionDeclaration" && node.id) {
      edits.push({
        start: node.end,
        end: node.end,
        text: `\nObject.defineProperty(${node.id.name}, "sourceCode", {value:${JSON.stringify(contents.slice(node.start, node.end))}});`,
      });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    contents =
      contents.slice(0, edit.start) + edit.text + contents.slice(edit.end);
  return contents;
}
export const preserveShaderSources = {
  name: "preserve-shader-sources",
  setup(build) {
    build.onLoad(
      {
        filter:
          /[\\/]example[\\/](?:(?:demos[\\/][^\\/]+[\\/](?:index|shaders))|shaders|more-shaders|extra-shaders|algorithm-shaders|fft-shaders|fft-examples|game-example|signal-examples|basic-examples|multi-shader|advanced|more-examples|extra-examples|algorithm-examples)\.js$/,
      },
      async ({ path }) => {
        const contents = await readFile(path, "utf8");
        const file = path.split(/[\\/]/).at(-1);
        let preserved = preserveExampleSource(contents, file);
        if (file === "index.js" && /[\\/]demos[\\/]/.test(path))
          preserved += `\nObject.defineProperty(setup, "moduleSource", {value:${JSON.stringify(contents)}});`;
        return {
          contents: preserved,
          loader: "js",
        };
      },
    );
  },
};
