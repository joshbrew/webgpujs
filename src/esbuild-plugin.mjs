import { readFile } from "node:fs/promises";
import { parse } from "acorn";

/** Preserve exported shader functions before esbuild renames their parameters. JavaScript modules only. */
export function preserveShaderSources({
  filter = /(?:[\\/]shaders|\.shaders)\.js$/,
  exports: exportNames,
} = {}) {
  const selected = exportNames ? new Set(exportNames) : undefined;
  return {
    name: "webgpujs-shader-sources",
    setup(build) {
      build.onLoad({ filter }, async ({ path }) => {
        const contents = await readFile(path, "utf8");
        const ast = parse(contents, {
            ecmaVersion: "latest",
            sourceType: "module",
          }),
          edits = [];
        const descriptor = (fn) => {
          if (fn.async || fn.generator)
            throw new Error(
              "Shader functions must be synchronous and cannot be generators",
            );
          return `{code:${JSON.stringify(contents.slice(fn.start, fn.end))},transpileString:true}`;
        };

        const exported = new Map();
        const add = (local, name) => {
          const names = exported.get(local) || new Set();
          names.add(name);
          exported.set(local, names);
        };
        for (const node of ast.body) {
          if (node.type === "ExportNamedDeclaration" && !node.source) {
            for (const specifier of node.specifiers || [])
              add(
                specifier.local.name,
                specifier.exported.name || specifier.exported.value,
              );
            if (node.declaration?.type === "FunctionDeclaration")
              add(node.declaration.id.name, node.declaration.id.name);
            for (const variable of node.declaration?.declarations || [])
              if (variable.id.type === "Identifier")
                add(variable.id.name, variable.id.name);
          }
          if (
            node.type === "ExportDefaultDeclaration" &&
            node.declaration.type === "Identifier"
          )
            add(node.declaration.name, "default");
        }
        const chosen = (name) =>
          exported.has(name) &&
          (!selected ||
            [...exported.get(name)].some((alias) => selected.has(alias)));
        for (const node of ast.body) {
          const declaration =
            node.type === "ExportNamedDeclaration" ? node.declaration : node;
          if (
            declaration?.type === "FunctionDeclaration" &&
            chosen(declaration.id.name)
          )
            edits.push({
              start: declaration.start,
              end: declaration.end,
              text: `const ${declaration.id.name}=${descriptor(declaration)};`,
            });
          else if (declaration?.type === "VariableDeclaration")
            for (const variable of declaration.declarations)
              if (
                variable.id.type === "Identifier" &&
                chosen(variable.id.name) &&
                ["ArrowFunctionExpression", "FunctionExpression"].includes(
                  variable.init?.type,
                )
              )
                edits.push({
                  start: variable.init.start,
                  end: variable.init.end,
                  text: descriptor(variable.init),
                });
          if (
            node.type === "ExportDefaultDeclaration" &&
            [
              "FunctionDeclaration",
              "FunctionExpression",
              "ArrowFunctionExpression",
            ].includes(node.declaration.type) &&
            (!selected || selected.has("default"))
          )
            edits.push({
              start: node.start,
              end: node.end,
              text: `export default ${descriptor(node.declaration)};`,
            });
        }
        let preserved = contents;
        for (const { start, end, text } of edits.sort(
          (a, b) => b.start - a.start,
        ))
          preserved = preserved.slice(0, start) + text + preserved.slice(end);
        return { contents: preserved, loader: "js" };
      });
    },
  };
}
