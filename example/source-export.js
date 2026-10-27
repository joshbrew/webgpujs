import { sourceText } from "./host-source.js";

export function exportFilename(name, extension) {
  return `${
    String(name)
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "") || "shader"
  }.${extension}`;
}
export function exampleExport(name, shaders, setup, animate) {
  return JSON.stringify(
    {
      format: "webgpujs-example",
      version: 1,
      name,
      shaders: shaders.map(
        ({ label, js, wgsl, error, language = "javascript" }) => ({
          label,
          language,
          source: js,
          ...(language === "javascript" ? { javascript: js } : {}),
          wgsl,
          ...(error ? { error } : {}),
        }),
      ),
      setup: sourceText(setup),
      animate: sourceText(animate),
    },
    null,
    2,
  );
}
export function downloadSource(name, content, extension) {
  const url = URL.createObjectURL(
    new Blob([content], {
      type:
        extension === "json" ? "application/json" : "text/plain;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename(name, extension);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
