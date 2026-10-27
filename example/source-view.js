import { downloadSource, exampleExport } from "./source-export.js";
import { sourceText } from "./host-source.js";
import { shaderInfo } from "./shader-info.js";
import { createPipelineOverview } from "./pipeline-overview.js";
const editorIds = {
  ex1: "dft",
  ex2: "triangle",
  ex3: "cube",
  ex4: "boids",
  ex5: "mandelbrot",
  ex6: "texture-chain",
  "chain-card": "implicit-chain",
  "particle-card": "particles",
  "texture-card": "texture-chain",
  "histogram-card": "histogram",
  "reaction-card": "reaction",
};

/** Always display the linked WGSL from the pipeline that actually runs. */
export function showSources(target, sources, setup, animate) {
  const details = document.createElement("section");
  details.className = "source-panel";
  const toolbar = document.createElement("div");
  toolbar.className = "source-toolbar";
  const label = document.createElement("label");
  label.textContent = "Shader ";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Shader to compare");
  sources.forEach((source, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = source.label;
    select.append(option);
  });
  label.append(select);
  toolbar.append(label);
  const name = target.closest("article")?.id || "example";
  let sourceDownload;
  for (const [title, extension, contents] of [
    ["Download JS", "js", () => sources[Number(select.value)].js],
    ["Download WGSL", "wgsl", () => sources[Number(select.value)].wgsl],
    [
      "Export example",
      "json",
      () => exampleExport(name, sources, setup, animate),
    ],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = title;
    button.addEventListener("click", () =>
      downloadSource(
        extension === "json"
          ? name
          : `${name}-${sources[Number(select.value)].label}`,
        contents(),
        extension === "js" && sources[Number(select.value)].language === "wgsl"
          ? "wgsl"
          : extension,
      ),
    );
    if (extension === "js") sourceDownload = button;
    toolbar.append(button);
  }
  const articleId = target.closest("article")?.id;
  if (articleId) {
    const link = document.createElement("a");
    link.href = `editor.html?example=${encodeURIComponent(editorIds[articleId] || articleId)}`;
    link.textContent = "Edit this example →";
    toolbar.append(link);
    const standalone = document.createElement("a");
    standalone.href = `demo.html?example=${encodeURIComponent(editorIds[articleId] || articleId)}`;
    standalone.textContent = "Run this demo alone →";
    toolbar.append(standalone);
  }
  details.append(
    createPipelineOverview(sources, (source, index) => {
      select.value = String(index);
      select.dispatchEvent(new Event("change"));
    }),
    toolbar,
  );
  const view = document.createElement("section");
  details.append(view);
  function showShader() {
    const source = sources[Number(select.value)];
    sourceDownload.textContent =
      source.language === "wgsl" ? "Download source" : "Download JS";
    const title = document.createElement("h3");
    title.textContent = source.label;
    const columns = document.createElement("div");
    columns.className = "source-columns";
    for (const [label, content] of [
      [
        source.language === "wgsl" ? "Native WGSL source" : "JavaScript",
        source.js,
      ],
      [
        source.language === "wgsl" ? "Linked WGSL" : "Generated WGSL",
        source.wgsl,
      ],
    ]) {
      const column = document.createElement("section");
      const heading = document.createElement("h4");
      heading.textContent = label;
      const code = document.createElement("pre");
      code.textContent = content;
      column.append(heading, code);
      columns.append(column);
    }
    view.replaceChildren(title, columns);
    if (source.resources?.length) {
      const connections = document.createElement("details");
      connections.className = "resource-connections";
      const summary = document.createElement("summary");
      summary.textContent = "Resource connections";
      const hint = document.createElement("p");
      hint.textContent =
        "These are the allocations used by the running shaders. Shared rows use the same GPU data, including when parameter names differ.";
      const scroll = document.createElement("div");
      scroll.className = "resource-table-scroll";
      const table = document.createElement("table");
      const caption = document.createElement("caption");
      caption.textContent = `Resources for ${source.label}`;
      const head = document.createElement("thead");
      const header = document.createElement("tr");
      for (const text of ["Shader variable", "Type / access", "Also used by"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = text;
        header.append(cell);
      }
      head.append(header);
      const body = document.createElement("tbody");
      for (const resource of source.resources) {
        const row = document.createElement("tr");
        for (const text of [
          resource.name,
          `${resource.type} · ${resource.access || resource.kind}`,
          resource.sharedWith.join(", ") || "Only this shader",
        ]) {
          const cell = document.createElement("td");
          cell.textContent = text;
          row.append(cell);
        }
        body.append(row);
      }
      table.append(caption, head, body);
      scroll.append(table);
      connections.append(summary, hint, scroll);
      view.append(connections);
    }
  }
  // Build only the selected comparison; long FFT chains can contain twenty passes.
  showShader();
  select.addEventListener("change", showShader);
  const hostDetails = document.createElement("details"),
    summary = document.createElement("summary");
  summary.textContent = "Setup and animation code";
  hostDetails.append(summary);
  const columns = document.createElement("div");
  columns.className = "source-columns";
  for (const [label, fn] of [
    ["Setup", setup],
    ["Animation / update", animate],
  ]) {
    if (!fn) continue;
    const column = document.createElement("section"),
      heading = document.createElement("h4"),
      code = document.createElement("pre");
    heading.textContent = label;
    code.textContent = sourceText(fn);
    column.append(heading, code);
    columns.append(column);
  }
  hostDetails.append(columns);
  details.append(hostDetails);
  const resourceNotes = Array.from(target.children).find(
    (child) => child.tagName === "DETAILS",
  );
  if (resourceNotes) target.insertBefore(details, resourceNotes);
  else target.append(details);
}

export function pipelineSources(...pipelines) {
  // Resource names only identify shared data inside the same allocation registry.
  const registries = new Map();
  const sources = pipelines.flatMap((pipeline, index) =>
    Object.entries(pipeline.prototypes).map(([stage, shader]) => {
      const info = shaderInfo(shader, stage, index, {
        multiple: pipelines.length > 1,
        entryPoint: pipeline.options?.entryPoints?.[stage],
      });
      const source = {
        ...info,
        js: shader.funcStr || shader.code,
        wgsl: shader.code,
        resources: (shader.resources || []).map((resource) => {
          const entry = {
            ...resource,
            location: info.location,
            sharedWith: [],
          };
          if (resource.resource) {
            if (!registries.has(pipeline.resources))
              registries.set(pipeline.resources, new Map());
            const uses = registries.get(pipeline.resources);
            if (!uses.has(resource.resource)) uses.set(resource.resource, []);
            uses.get(resource.resource).push(entry);
          }
          return entry;
        }),
      };
      return source;
    }),
  );
  for (const uses of registries.values())
    for (const entries of uses.values())
      for (const entry of entries)
        entry.sharedWith = entries
          .filter((other) => other !== entry)
          .map((other) => `${other.location} → ${other.name}`);
  return sources;
}
