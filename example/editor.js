import { requestDemoDevice } from "./shared/device.js";
import { editorExamples } from "./editor-examples.js";
import { downloadSource, exampleExport } from "./source-export.js";
import { createAnimationScheduler } from "./animation-scheduler.js";
import { galleryGroups } from "./gallery-catalog.js";
import { sourceText } from "./host-source.js";
import { createPipelineOverview } from "./pipeline-overview.js";
import {
  mountDemoControls,
  mountPointerControls,
  mountPlotLegend,
} from "./shared/controls.js";
import {
  buildExample,
  translateDrafts,
  disposeExample,
} from "./editor-session.js";

const $ = (selector) => document.querySelector(selector);
const exampleSelect = $("#example-select"),
  shaderSelect = $("#shader-select"),
  rebuild = $("#rebuild");
const buildStatus = $("#build-status"),
  translateStatus = $("#translate-status"),
  dirty = $("#dirty");
const draftsByExample = new Map(),
  baselines = new Map(),
  panes = new Map(),
  recordsByExample = new Map(),
  controlsByExample = new Map();
let device,
  active,
  definition,
  records = [],
  drafts = new Map(),
  revision = 0,
  applied = -1,
  busy = false,
  paused = false,
  timer;

for (const group of galleryGroups) {
  const choices = document.createElement("optgroup");
  choices.label = group.title;
  for (const id of group.examples) {
    const entry = editorExamples.find((example) => example.id === id);
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.title;
    choices.append(option);
  }
  exampleSelect.append(choices);
}
const requested = new URL(location.href).searchParams.get("example");
exampleSelect.value = editorExamples.some((entry) => entry.id === requested)
  ? requested
  : "julia";
const scheduler = createAnimationScheduler({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  onState: (animation, state) => {
    active?.demo.setActive?.(state === "running" || state === "updating");
    $("#preview").dataset.state = state;
    $("#preview").dataset.frames = animation.frames;
  },
  onError(error) {
    paused = true;
    scheduler.setPaused(true);
    $("#pause").textContent = "Resume preview";
    buildStatus.className = "error";
    buildStatus.textContent = `Preview stopped: ${error.message}. Edit the source and rebuild.`;
  },
});
const previewAnimation = scheduler.add(
  async (time) => {
    if (!active) return;
    await active.demo.frame?.(time, active.controls);
    active.syncControls?.();
    updatePreviewOutput();
    if (active.demo.done) previewAnimation.continuous = false;
  },
  {
    continuous: false,
  },
);
scheduler.setHidden(document.hidden);
document.addEventListener("visibilitychange", () =>
  scheduler.setHidden(document.hidden),
);
const previewObserver = new IntersectionObserver((entries) =>
  scheduler.setVisible(previewAnimation, entries[0].isIntersecting),
);
previewObserver.observe($("#preview"));

function status() {
  dirty.textContent =
    revision === applied ? "Preview up to date" : "Unbuilt edits";
  dirty.className = revision === applied ? "" : "pending";
}
function translate() {
  if (!records.length) return;
  const result = translateDrafts(records, drafts);
  for (const shader of result.shaders) {
    const pane = panes.get(shader.id);
    if (!pane) continue;
    pane.output.textContent = shader.code;
    pane.error.textContent = shader.error || "";
    pane.error.hidden = !shader.error;
    pane.caption.textContent = result.linked
      ? "WGSL preview · linked bindings"
      : "WGSL preview · resolve errors to link bindings";
    pane.input.setAttribute("aria-invalid", shader.error ? "true" : "false");
  }
  translateStatus.textContent = result.errors.length
    ? result.errors
        .map(
          (error) =>
            `${error.id || `Pass ${error.pass + 1}`}: ${error.message}`,
        )
        .join("\n")
    : "Live translation ready. GPU preview changes only after Rebuild.";
  translateStatus.className = result.errors.length ? "error" : "";
  return result;
}
function renderEditors() {
  $("#shader-editors").replaceChildren();
  shaderSelect.replaceChildren();
  panes.clear();
  for (const record of records)
    for (const shader of record.shaders) {
      const article = document.createElement("article");
      article.className = "shader-editor";
      article.id = `shader-${shader.id.replace(":", "-")}`;
      const heading = document.createElement("h2");
      heading.textContent = shader.label;
      const columns = document.createElement("div");
      columns.className = "source-columns";
      const left = document.createElement("section"),
        right = document.createElement("section");
      const label = document.createElement("label");
      label.textContent = shader.raw ? "WGSL source" : "JavaScript source";
      const input = document.createElement("textarea");
      input.id = `source-${shader.id.replace(":", "-")}`;
      label.htmlFor = input.id;
      input.value = drafts.get(shader.id) ?? shader.source;
      input.spellcheck = false;
      input.autocapitalize = "off";
      input.setAttribute(
        "aria-label",
        `${shader.label} ${shader.raw ? "WGSL" : "JavaScript"} source`,
      );
      input.wrap = "off";
      const caption = document.createElement("h4");
      caption.textContent = "WGSL preview";
      const output = document.createElement("pre"),
        error = document.createElement("p");
      error.className = "error";
      error.hidden = true;
      left.append(label, input, error);
      right.append(caption, output);
      columns.append(left, right);
      article.append(heading, columns);
      $("#shader-editors").append(article);
      panes.set(shader.id, { input, output, error, caption, article });
      input.addEventListener("input", () => {
        drafts.set(shader.id, input.value);
        revision++;
        status();
        clearTimeout(timer);
        timer = setTimeout(translate, 120);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          const start = input.selectionStart,
            end = input.selectionEnd;
          input.setRangeText("    ", start, end, "end");
          input.dispatchEvent(new Event("input"));
        }
      });
      const option = document.createElement("option");
      option.value = shader.id;
      option.textContent = shader.label;
      shaderSelect.append(option);
    }
  $("#pipeline-overview").replaceChildren(
    createPipelineOverview(
      records.flatMap((record) => record.shaders),
      (shader) => {
        shaderSelect.value = shader.id;
        shaderSelect.dispatchEvent(new Event("change"));
      },
    ),
  );
  translate();
  updateExportLabel();
}
function updateExportLabel() {
  const shader = records
    .flatMap((record) => record.shaders)
    .find((shader) => shader.id === shaderSelect.value);
  $("#export-js").textContent = shader?.raw
    ? "Download shader source"
    : "Download shader JS";
}

function updatePreviewOutput() {
  const text = active?.demo.resultInfo || active?.demo.info || "";
  $("#preview-output").textContent = text;
  $("#preview-output").hidden = !text;
}
async function validateFrame(candidate, time) {
  device.pushErrorScope("validation");
  let error;
  try {
    await candidate.demo.frame?.(time, candidate.controls);
  } finally {
    error = await device.popErrorScope();
  }
  if (error) throw new Error(error.message);
}

async function build(initial = false) {
  if (busy) return;
  busy = true;
  scheduler.setPaused(true);
  rebuild.disabled = true;
  exampleSelect.disabled = true;
  $("#reset-code").disabled = true;
  const builtRevision = revision,
    snapshot = new Map(drafts);
  let candidate;
  buildStatus.className = "";
  buildStatus.textContent = "Rebuilding all shader passes…";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = definition.canvasSize?.[0] || 512;
    canvas.height = definition.canvasSize?.[1] || 320;
    canvas.setAttribute("aria-label", `${definition.title} preview`);
    candidate = await buildExample(definition.setup, canvas, device, snapshot);
    candidate.controls = {
      ...Object.fromEntries(
        (definition.controls || []).map(([key, , , , , initial]) => [
          key,
          initial,
        ]),
      ),
      ...(controlsByExample.get(definition.id) || {}),
      down: false,
    };
    await validateFrame(candidate, 0);
    const old = active;
    active = candidate;
    Object.assign(previewAnimation, {
      time: 0,
      lastTime: null,
      frames: 1,
      dirty: false,
      failed: false,
      continuous: active.demo.continuous !== false,
    });
    candidate = undefined;
    $("#preview").replaceChildren(canvas);
    controlsByExample.set(definition.id, active.controls);
    mountPointerControls(canvas, definition, active.controls, () =>
      scheduler.invalidate(previewAnimation),
    );
    active.syncControls = mountDemoControls(
      definition.controls || [],
      $("#preview"),
      active.controls,
      () => scheduler.invalidate(previewAnimation),
      "editor",
    );
    mountPlotLegend(definition.legend, $("#preview"));
    active.demo.mountControls?.($("#preview"), () =>
      scheduler.invalidate(previewAnimation),
    );
    $("#example-title").textContent = definition.title;
    updatePreviewOutput();
    if (active.demo.reset) {
      const restart = document.createElement("button");
      restart.textContent = "Restart demo";
      restart.addEventListener("click", () => {
        active.demo.reset();
        previewAnimation.continuous = active.demo.continuous !== false;
        scheduler.invalidate(previewAnimation);
      });
      $("#preview").append(restart);
    }
    records = active.records;
    recordsByExample.set(definition.id, records);
    if (!baselines.has(definition.id))
      baselines.set(
        definition.id,
        new Map(
          records.flatMap((record) =>
            record.shaders.map((shader) => [shader.id, shader.source]),
          ),
        ),
      );
    for (const record of records)
      for (const shader of record.shaders)
        if (!drafts.has(shader.id)) drafts.set(shader.id, shader.source);
    applied = builtRevision;
    if (initial) renderEditors();
    else translate();
    $("#setup-code").textContent =
      definition.setupSource || sourceText(definition.setup);
    $("#animation-code").textContent =
      active.demo.hostFrameSource ||
      sourceText(active.demo.frame) ||
      "// No animation loop.";
    buildStatus.textContent = `Built ${records.reduce((count, record) => count + record.shaders.length, 0)} shaders across ${records.length} pipeline${records.length === 1 ? "" : "s"}.`;
    disposeExample(old);
  } catch (error) {
    disposeExample(candidate);
    buildStatus.className = "error";
    buildStatus.textContent = `Build failed. ${active ? "The last working preview is still running. " : ""}${error.message}`;
  } finally {
    busy = false;
    scheduler.setPaused(paused);
    rebuild.disabled = false;
    exampleSelect.disabled = false;
    $("#reset-code").disabled = false;
    status();
  }
}

async function choose() {
  clearTimeout(timer);
  definition = editorExamples.find((entry) => entry.id === exampleSelect.value);
  const url = new URL(location.href);
  url.searchParams.set("example", definition.id);
  history.replaceState(null, "", url);
  drafts = draftsByExample.get(definition.id) || new Map();
  draftsByExample.set(definition.id, drafts);
  records = recordsByExample.get(definition.id) || [];
  revision = 0;
  applied = -1;
  panes.clear();
  $("#shader-editors").replaceChildren();
  shaderSelect.replaceChildren();
  if (records.length) renderEditors();
  await build(true);
}

rebuild.addEventListener("click", () => build());
$("#export-js").addEventListener("click", () => {
  const shader = records
    .flatMap((record) => record.shaders)
    .find((shader) => shader.id === shaderSelect.value);
  if (shader)
    downloadSource(
      `${definition.id}-${shader.label}`,
      drafts.get(shader.id) ?? shader.source,
      shader.raw ? "wgsl" : "js",
    );
});
$("#export-wgsl").addEventListener("click", () => {
  const result = translateDrafts(records, drafts);
  const shader = result.shaders.find(
    (shader) => shader.id === shaderSelect.value,
  );
  if (shader?.code && !result.errors.length)
    downloadSource(
      `${definition.id}-${shader.label || shader.id}`,
      shader.code,
      "wgsl",
    );
  else {
    translate();
    translateStatus.textContent =
      "Resolve translation errors before exporting WGSL.";
  }
});
$("#export-example").addEventListener("click", () => {
  const result = translateDrafts(records, drafts);
  const shaders = records
    .flatMap((record) => record.shaders)
    .map((shader) => ({
      label: shader.label,
      js: drafts.get(shader.id) ?? shader.source,
      language: shader.raw ? "wgsl" : "javascript",
      wgsl:
        result.shaders.find((output) => output.id === shader.id)?.code || "",
      error: result.errors.find((error) => error.id === shader.id)?.message,
    }));
  downloadSource(
    definition.id,
    exampleExport(
      definition.title,
      shaders,
      definition.setupSource || definition.setup,
      active?.demo.hostFrameSource || active?.demo.frame,
    ),
    "json",
  );
});
exampleSelect.addEventListener("change", choose);
shaderSelect.addEventListener("change", () => {
  updateExportLabel();
  const pane = panes.get(shaderSelect.value);
  pane?.article.scrollIntoView({ behavior: "smooth", block: "start" });
  pane?.input.focus({ preventScroll: true });
});
$("#reset-code").addEventListener("click", () => {
  const baseline = baselines.get(definition.id);
  if (!baseline) return;
  drafts.clear();
  for (const [key, value] of baseline) drafts.set(key, value);
  revision++;
  renderEditors();
  status();
});
$("#pause").addEventListener("click", () => {
  paused = !paused;
  scheduler.setPaused(paused);
  $("#pause").textContent = paused ? "Resume preview" : "Pause preview";
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    build();
  }
});
window.addEventListener(
  "pagehide",
  () => {
    scheduler.setHidden(true);
    previewObserver.disconnect();
    disposeExample(active);
  },
  {
    once: true,
  },
);

try {
  if (!navigator.gpu)
    throw new Error(
      "WebGPU is unavailable. Use localhost or HTTPS in a WebGPU-capable browser.",
    );
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found");
  device = await requestDemoDevice(adapter);
  device.addEventListener("uncapturederror", (event) => {
    buildStatus.className = "error";
    buildStatus.textContent = event.error.message;
  });
  await choose();
} catch (error) {
  buildStatus.className = "error";
  buildStatus.textContent = error.message;
  rebuild.disabled = true;
}
