/** Authored source is attached by the example build; unbundled use falls back to toString(). */
export function sourceText(value) {
  return typeof value === "function"
    ? (value.sourceCode ?? value.toString())
    : value;
}

const metadataKeys = new Set([
  "title",
  "description",
  "category",
  "setup",
  "helpers",
  "algorithm",
  "canvasSize",
]);

function configurationValue(value) {
  // Shader declarations are available in their own source panes. Reference them by name here.
  if (
    typeof value === "function" ||
    (value && typeof value === "object" && "code" in value)
  ) {
    const code = typeof value === "function" ? sourceText(value) : value.code;
    return (
      String(code).match(/function\s+([\w$]+)/)?.[1] ||
      value.name ||
      "shaderSource"
    );
  }
  return JSON.stringify(value, null, 2);
}

export function exampleSetupSource(definition, helpers = []) {
  const fields = Object.entries(definition)
    .filter(([key]) => !metadataKeys.has(key))
    .map(
      ([key, value]) =>
        `  ${JSON.stringify(key)}: ${configurationValue(value)?.replace(/\n/g, "\n  ")}`,
    );
  const configuration = `// Shader references below match the shader selector.\nconst definition = {\n${fields.join(",\n")}\n};`;
  const support = [...helpers, ...(definition.helpers || [])].map(sourceText);
  return [configuration, sourceText(definition.setup), ...support]
    .filter(Boolean)
    .join("\n\n");
}
