import { requestDemoDevice } from "./shared/device.js";
// Minimal host: each selected module owns its shaders, buffers, passes and controls.
import { demos } from "./demos/index.js";
import {
  mountDemoControls,
  mountPointerControls,
  mountPlotLegend,
} from "./shared/controls.js";

const canvas = document.querySelector("#gpu");
const output = document.querySelector("#output");
const id = new URL(location.href).searchParams.get("example") || "cube";
const definition = demos.find((demo) => demo.id === id);
let syncControls,
  demo,
  device,
  queued = false,
  dirty = true,
  visible = true,
  busy = false,
  failed = false,
  clock = 0,
  last = null;
const controls = {};
function invalidate() {
  dirty = true;
  if (!queued && !busy && !failed && visible && !document.hidden) {
    queued = true;
    requestAnimationFrame(animate);
  }
}
async function animate(timestamp) {
  queued = false;
  if (!visible || document.hidden) return;
  if (!dirty && (demo.continuous === false || demo.done)) return;
  dirty = false;
  busy = true;
  if (last !== null) clock += timestamp - last;
  last = timestamp;
  try {
    await demo.frame(clock, controls);
    syncControls?.();
    output.textContent = demo.resultInfo || demo.info || "";
  } catch (error) {
    failed = true;
    output.textContent = error.message;
    demo.setActive?.(false);
  } finally {
    busy = false;
  }
  if (dirty || (demo.continuous !== false && !demo.done)) invalidate();
}
try {
  if (!definition) throw new Error(`Unknown example ${id}`);
  document.querySelector("#title").textContent = definition.title;
  document.querySelector("#description").textContent = definition.description;
  document.querySelector("#edit").href =
    `editor.html?example=${encodeURIComponent(id)}`;
  document.title = `${definition.title} · WebGPUjs`;
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("A WebGPU-capable browser is required.");
  device = await requestDemoDevice(adapter);
  [canvas.width, canvas.height] = definition.canvasSize || [512, 320];
  canvas.setAttribute("aria-label", definition.title);
  demo = await definition.setup(canvas, device);
  syncControls = mountDemoControls(
    definition.controls || [],
    document.querySelector("#controls"),
    controls,
    invalidate,
  );
  mountPlotLegend(definition.legend, document.querySelector("#controls"));
  canvas.hidden = ["dft", "implicit-chain"].includes(id);
  demo.mountControls?.(document.querySelector("#controls"), invalidate);
  if (demo.reset) {
    const reset = document.createElement("button");
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      demo.reset();
      invalidate();
    });
    document.querySelector("#controls").append(reset);
  }
  mountPointerControls(canvas, definition, controls, invalidate);
  const observe = () => {
    if (!visible || document.hidden) last = null;
    demo.setActive?.(visible && !document.hidden);
    invalidate();
  };
  document.addEventListener("visibilitychange", observe);
  if (!canvas.hidden)
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      observe();
    }).observe(canvas);
  invalidate();
} catch (error) {
  output.textContent = error.message;
}
window.addEventListener("pagehide", () => {
  demo?.dispose?.();
  for (const helper of demo?.pipelines || []) helper.dispose();
  device?.destroy();
});
