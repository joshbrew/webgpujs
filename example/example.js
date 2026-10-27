import {
  mountDemoControls,
  mountPointerControls,
  mountPlotLegend,
} from "./shared/controls.js";
import { requestDemoDevice } from "./shared/device.js";
import { editorExamples } from "./editor-examples.js";
import { showSources, pipelineSources } from "./source-view.js";
import { createAnimationScheduler } from "./animation-scheduler.js";
import { galleryGroups } from "./gallery-catalog.js";

const status = document.querySelector("#status");
document.querySelector("#example-count").textContent =
  `WebGPUjs / ${editorExamples.length} examples`;
document.title = `WebGPUjs · ${editorExamples.length} JavaScript GPU examples`;
const items = new Map();
const metadataById = new Map(editorExamples.map((entry) => [entry.id, entry]));
let paused = false;
let lastScroll = 0;
window.addEventListener(
  "scroll",
  () => {
    lastScroll = performance.now();
  },
  { passive: true },
);
async function quietMoment() {
  while (performance.now() - lastScroll < 160)
    await new Promise((resolve) => setTimeout(resolve, 80));
  await new Promise((resolve) =>
    window.requestIdleCallback
      ? requestIdleCallback(resolve, { timeout: 600 })
      : setTimeout(resolve, 0),
  );
}
function updateStatus() {
  status.textContent = `${editorExamples.length} examples. Previews run in view and pause when you scroll away.`;
}
function fail(error, item) {
  item.message.textContent = error.message;
  item.message.classList.add("error");
  item.article.dataset.state = "error";
  updateStatus();
  console.error(error);
}
const scheduler = createAnimationScheduler({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  onError: (error, animation) => fail(error, animation.context),
  onState(animation, state) {
    const item = animation.context;
    item.demo?.setActive?.(state === "running" || state === "updating");
    item.article.dataset.state = state;
    item.article.dataset.frames = animation.frames;
    if (state === "error") return;
    const text = {
      running: "Animating",
      offscreen: "Paused · preview out of view",
      paused: "Paused",
      hidden: "Paused · tab hidden",
      ready: "Ready",
      updating: "Updating…",
    }[state];
    if (item.message.textContent !== text) item.message.textContent = text;
  },
});
scheduler.setHidden(document.hidden);
document.addEventListener("visibilitychange", () =>
  scheduler.setHidden(document.hidden),
);
document.querySelector("#pause").addEventListener("click", (event) => {
  paused = !paused;
  scheduler.setPaused(paused);
  event.target.textContent = paused ? "Resume animations" : "Pause animations";
  event.target.setAttribute("aria-pressed", String(paused));
});

const navGroups = new Map();
for (const group of galleryGroups) {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = group.title;
  const description = document.createElement("p");
  description.textContent = group.description;
  const list = document.createElement("ol");
  section.append(heading, description, list);
  document.querySelector("#nav").append(section);
  const choices = document.createElement("optgroup");
  choices.label = group.title;
  document.querySelector("#jump").append(choices);
  for (const id of group.examples) navGroups.set(id, { list, choices, group });
}
for (const [index, definition] of editorExamples.entries()) {
  const group = navGroups.get(definition.id).group;
  if (definition.id === group.examples[0]) {
    const heading = document.createElement("header");
    heading.className = "gallery-section-heading";
    heading.id = `section-${group.id}`;
    const title = document.createElement("h2");
    title.textContent = group.title;
    const description = document.createElement("p");
    description.textContent = group.description;
    heading.append(title, description);
    document.querySelector("#examples").append(heading);
  }
  const metadata = metadataById.get(definition.id);
  const article = document.createElement("article");
  article.id = definition.id;
  article.dataset.state = "waiting";
  const top = document.createElement("div");
  top.className = "demo-top";
  const info = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = group.title;
  const heading = document.createElement("h2");
  heading.textContent = `${String(index + 1).padStart(2, "0")} / ${definition.title}`;
  const description = document.createElement("p");
  description.textContent = metadata?.description || definition.description;
  const message = document.createElement("p");
  message.className = "preview-status";
  message.textContent = "Starts when the preview is in view.";
  const controls = document.createElement("div");
  info.append(eyebrow, heading, description, message, controls);
  const canvas = document.createElement("canvas");
  canvas.width =
    definition.canvasSize?.[0] || (definition.id === "reaction" ? 256 : 512);
  canvas.height =
    definition.canvasSize?.[1] || (definition.id === "reaction" ? 160 : 320);
  canvas.setAttribute("aria-label", definition.title);
  const output = document.createElement("pre");
  output.className = "demo-output";
  output.hidden = true;
  const computeOnly = ["dft", "implicit-chain"].includes(definition.id);
  canvas.hidden = computeOnly;
  if (computeOnly) {
    output.hidden = false;
    output.textContent = "Compute result appears here.";
  }
  const preview = document.createElement("div");
  preview.className = "preview";
  preview.append(canvas, output);
  top.append(info, preview);
  const source = document.createElement("div");
  source.className = "source";
  article.append(top, source);
  document.querySelector("#examples").append(article);
  const link = document.createElement("a");
  link.href = `#${definition.id}`;
  link.textContent = `${String(index + 1).padStart(2, "0")} · ${definition.title}`;
  const navigationItem = document.createElement("li");
  navigationItem.append(link);
  navGroups.get(definition.id).list.append(navigationItem);
  const option = document.createElement("option");
  option.value = definition.id;
  option.textContent = heading.textContent;
  navGroups.get(definition.id).choices.append(option);
  const item = {
    definition,
    article,
    canvas,
    preview,
    message,
    controls,
    output,
    source,
    values: {},
    visible: false,
    loading: false,
  };
  const interactiveControls = [...(definition.controls || [])];
  if (
    !metadata?.algorithm &&
    ![
      "dft",
      "triangle",
      "mandelbrot",
      "implicit-chain",
      "histogram",
      "sort",
      "scan",
      "game",
      "fft",
      "spectral",
      "fir",
      "batch-fft",
      "fft-2d",
      "video-ascii",
    ].includes(definition.id)
  )
    interactiveControls.push(
      ["speed", "Time scale", 0, 2, 0.05, 1],
      ...(!metadata?.mode &&
      definition.id !== "reaction" &&
      definition.id !== "boids"
        ? [["phase", "Time / phase", 0, 30, 0.1, 0]]
        : []),
    );
  item.syncControls = mountDemoControls(
    interactiveControls,
    controls,
    item.values,
    () => {
      if (item.animation) scheduler.invalidate(item.animation);
    },
    definition.id,
  );
  mountPlotLegend(definition.legend, controls);
  if (metadata?.stateType || metadata?.interactive) {
    const hint = document.createElement("p");
    hint.className = "interaction-hint";
    hint.textContent =
      metadata.interactionHint ||
      (metadata.mode === "cloth"
        ? "Hold and drag to pull the cloth. Two upper corners are pinned."
        : metadata.stateType
          ? "Hold and drag on the preview to disturb the simulation."
          : "Move to pan or steer; use Zoom to explore.");
    controls.append(hint);
    mountPointerControls(canvas, definition, item.values, () => {
      if (item.animation) scheduler.invalidate(item.animation);
    });
  }
  items.set(preview, item);
}
const requestedId = decodeURIComponent(location.hash.slice(1));
if (requestedId) {
  document.querySelector("#jump").value = requestedId;
  requestAnimationFrame(() =>
    document.getElementById(requestedId)?.scrollIntoView(),
  );
}
document.querySelector("#jump").addEventListener("change", (event) => {
  const id = event.target.value;
  if (id) {
    location.hash = id;
    document.getElementById(id).scrollIntoView();
  }
});

try {
  if (!navigator.gpu)
    throw new Error(
      "WebGPU is unavailable. Open this page on localhost or HTTPS in a WebGPU browser.",
    );
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter was found.");
  const device = await requestDemoDevice(adapter);
  device.addEventListener("uncapturederror", (event) => {
    status.textContent = event.error.message;
    status.classList.add("error");
    console.error(event.error);
  });
  device.lost.then((info) => {
    scheduler.setPaused(true);
    status.textContent = `GPU device lost: ${info.message}. Reload to restart the examples.`;
    status.classList.add("error");
  });
  let setupQueue = Promise.resolve();
  async function initialize(item) {
    await quietMoment();
    if (!item.near) {
      item.loading = false;
      return;
    }
    try {
      item.message.textContent = "Preparing shaders…";
      const demo = await item.definition.setup(item.canvas, device);
      item.demo = demo;
      if (demo.info) {
        item.output.hidden = false;
        item.output.textContent = demo.info;
      }
      if (demo.output)
        item.output.textContent = `64 samples of 1 → DC = ${demo.output[0].toFixed(3)}, imaginary DC = ${demo.output[1].toFixed(3)}\nMaximum other frequency: ${Math.max(...Array.from(demo.output.slice(2)).map(Math.abs)).toExponential(2)}`;
      await quietMoment();
      showSources(
        item.source,
        pipelineSources(...demo.pipelines),
        item.definition.setupSource || item.definition.setup,
        demo.hostFrameSource || demo.frame,
      );
      let localTime = 0,
        previousTime = 0;
      async function frame(time) {
        const v = item.values;
        localTime += (time - previousTime) * (v.speed ?? 1);
        previousTime = time;
        time = localTime + (v.phase ?? 0) * 1000;
        await demo.frame(time, v);
        item.syncControls?.();
        if (demo.resultInfo) {
          item.output.hidden = false;
          item.output.textContent = demo.resultInfo;
        }
        if (demo.score !== undefined)
          item.output.textContent =
            demo.score +
            " / 12 crystals" +
            (demo.score === 12
              ? " · All collected! Reset to play again."
              : " · Click to walk, or focus the scene and use WASD / arrows.");
        if (demo.progress !== undefined) {
          item.progress.textContent =
            "Stage " +
            demo.progress +
            " / " +
            demo.stages +
            (demo.done ? " · complete" : "");
          if (demo.done) item.animation.continuous = false;
        }
      }
      item.animation = scheduler.add(frame, {
        continuous: demo.continuous !== false,
        visible: item.visible,
        context: item,
      });
      demo.mountControls?.(item.controls, () =>
        scheduler.invalidate(item.animation),
      );
      if (demo.stages) {
        item.progress = document.createElement("p");
        item.progress.textContent = `Stage 0 / ${demo.stages}`;
        item.controls.append(item.progress);
        const step = document.createElement("button");
        step.textContent = "Next stage";
        step.addEventListener("click", () => {
          item.animation.continuous = false;
          item.values.singleStep = true;
          scheduler.invalidate(item.animation);
        });
        item.controls.append(step);
      }
      if (demo.reset) {
        const reset = document.createElement("button");
        reset.textContent = "Reset";
        reset.addEventListener("click", () => {
          try {
            demo.reset();
            item.animation.continuous = demo.continuous !== false;
            scheduler.invalidate(item.animation);
          } catch (error) {
            fail(error, item);
          }
        });
        item.controls.append(reset);
      }
      updateStatus();
    } catch (error) {
      fail(error, item);
    }
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const item = items.get(entry.target);
        item.visible = entry.isIntersecting && entry.intersectionRatio > 0;
        if (item.animation) scheduler.setVisible(item.animation, item.visible);
      }
    },
    { threshold: 0 },
  );
  const preparationObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const item = items.get(entry.target);
        item.near = entry.isIntersecting;
        if (!item.demo && item.near && !item.loading) {
          item.loading = true;
          setupQueue = setupQueue.then(() => initialize(item));
        }
      }
    },
    { rootMargin: "400px" },
  );
  for (const preview of items.keys()) {
    observer.observe(preview);
    preparationObserver.observe(preview);
  }
  updateStatus();
} catch (error) {
  status.textContent = error.message;
  status.classList.add("error");
  console.error(error);
}
