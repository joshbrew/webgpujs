// Video / image → RGBA buffer → luminance + Sobel buffer → ASCII rendering.
// setup() and frame() have no dependency on the gallery or editor.
import { WebGPUjs } from "../../../src/pipeline";
import { decodeFrame, extractFeatures, asciiDisplay } from "./shaders.js";

// CC0 sample with verified HTTPS and cross-origin access. The older Blender sample URLs return 403.
export const sampleVideo =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

function glyphAtlas() {
  if (typeof document === "undefined")
    return {
      width: 160,
      height: 24,
      buffer: new Uint8Array(160 * 24 * 4).fill(255),
    };
  const atlas = document.createElement("canvas");
  atlas.width = 160;
  atlas.height = 24;
  const context = atlas.getContext("2d");
  context.fillStyle = "black";
  context.fillRect(0, 0, 160, 24);
  context.fillStyle = "white";
  context.font = "bold 22px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  Array.from(" .:-=+*#%@").forEach((glyph, i) =>
    context.fillText(glyph, i * 16 + 8, 12),
  );
  return atlas;
}

function createInput() {
  // The GPU path also works in workers/headless tests with ordinary typed texture data.
  if (typeof document === "undefined")
    return {
      source: () => ({
        width: 2,
        height: 2,
        buffer: new Uint8Array([
          255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
        ]),
      }),
      label: () => "Typed image input",
      setActive() {},
      dispose() {},
    };
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.controls = true;
  video.setAttribute("aria-label", "Source video");
  const fallback = document.createElement("canvas");
  fallback.width = 256;
  fallback.height = 144;
  const context = fallback.getContext("2d");
  let active = true,
    bitmap,
    objectURL,
    disposed = false,
    videoLabel = "Sample video · MDN CC0 flower",
    label = "Loading sample video…";
  const play = () => {
    if (active && !bitmap && !disposed)
      video.play().catch((error) => {
        if (error.name === "NotAllowedError")
          label = "Press Play video to start playback";
      });
  };
  video.addEventListener("loadeddata", () => {
    label = videoLabel;
    play();
  });
  video.addEventListener("error", () => {
    label =
      "Video unavailable · generated fallback. Choose a local video or image.";
  });
  function loadVideo(url, title = "Sample video · MDN CC0 flower") {
    videoLabel = title;
    label = "Loading " + title + "…";
    bitmap?.close();
    bitmap = undefined;
    video.pause();
    video.src = url;
    video.load();
    play();
  }
  loadVideo(sampleVideo);
  return {
    source(time) {
      if (bitmap) return bitmap;
      if (video.readyState >= 2) return video;
      const gradient = context.createLinearGradient(0, 0, 256, 144);
      gradient.addColorStop(0, "#094851");
      gradient.addColorStop(1, "#f8b46c");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 144);
      context.fillStyle = "#e7fff1";
      context.beginPath();
      context.arc(128 + Math.sin(time / 900) * 75, 72, 34, 0, Math.PI * 2);
      context.fill();
      return fallback;
    },
    label: () => label,
    setActive(value) {
      active = value;
      if (active) play();
      else video.pause();
    },
    mountControls(container, invalidate) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*,image/*";
      const caption = document.createElement("label");
      caption.textContent = "Video or image file ";
      caption.append(input);
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          if (objectURL) URL.revokeObjectURL(objectURL);
          if (file.type.startsWith("image/")) {
            video.pause();
            bitmap?.close();
            bitmap = await createImageBitmap(file);
            label = file.name;
          } else {
            objectURL = URL.createObjectURL(file);
            loadVideo(objectURL, file.name);
          }
          invalidate();
        } catch (error) {
          label = error.message;
          invalidate();
        }
      });
      const playButton = document.createElement("button");
      playButton.textContent = "Play video";
      playButton.addEventListener("click", () => {
        active = true;
        play();
        invalidate();
      });
      const reset = document.createElement("button");
      reset.textContent = "Use sample video";
      reset.addEventListener("click", () => {
        if (objectURL) URL.revokeObjectURL(objectURL);
        objectURL = undefined;
        input.value = "";
        loadVideo(sampleVideo);
        invalidate();
      });
      const source = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Source video";
      source.append(summary, video);
      const group = document.createElement("div");
      group.className = "media-input-controls";
      group.append(caption, playButton, reset, source);
      container.append(group);
    },
    dispose() {
      disposed = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      bitmap?.close();
      if (objectURL) URL.revokeObjectURL(objectURL);
    },
  };
}

export async function setup(canvas, device, options = {}) {
  const width = options.width ?? 128,
    height = options.height ?? 72;
  const input = createInput();
  const decode = await WebGPUjs.createPipeline(decodeFrame, {
    device,
    computePass: {
      workgroupsX: Math.ceil((width * height) / 64),
      skipOutputDef: true,
    },
    resourceBindings: { pixels: { resource: "media-pixels" } },
  });
  decode.compute.buffer({
    inputs: {
      image: input.source(0),
      pixels: new Float32Array(width * height * 4),
      width,
      height,
    },
  });
  const features = await WebGPUjs.combineShaders(
    extractFeatures,
    {
      resourceBindings: {
        pixels: { resource: "media-pixels" },
        features: { resource: "media-features" },
      },
      computePass: {
        workgroupsX: Math.ceil((width * height) / 64),
        skipOutputDef: true,
      },
    },
    decode,
  );
  features.compute.buffer({
    inputs: { features: new Float32Array(width * height * 2), width, height },
  });
  const display = await WebGPUjs.combineShaders(
    asciiDisplay,
    {
      canvas,
      resourceBindings: {
        pixels: { resource: "media-pixels" },
        features: { resource: "media-features" },
      },
      renderPass: {
        vbos: [],
        vertexCount: 3,
        textures: { atlas: glyphAtlas() },
      },
    },
    features,
  );
  async function frame(time, controls = {}) {
    const encoder = device.createCommandEncoder();
    await decode.compute.run({
      commandEncoder: encoder,
      inputs: { image: input.source(time), width, height },
    });
    await features.compute.run({
      commandEncoder: encoder,
      inputs: { width, height },
    });
    await display.render({
      commandEncoder: encoder,
      inputs: {
        width,
        height,
        columns: controls.columns ?? 64,
        colorize: controls.colorize ?? 1,
        edgeMix: controls.edgeMix ?? 0.35,
      },
    });
    device.queue.submit([encoder.finish()]);
  }
  return {
    pipelines: [decode, features, display],
    frame,
    mountControls: input.mountControls,
    setActive: input.setActive,
    dispose: input.dispose,
    get resultInfo() {
      return `${input.label()}\nLeft: captured pixel buffer. Right: glyph atlas selected by luminance and Sobel edges. Three passes, one submission, no CPU pixel readback.`;
    },
    getBuffer(name = "pixels") {
      const helper = name === "pixels" ? decode : features;
      return helper.resources.get(
        helper.compute.resources.find((resource) => resource.name === name)
          .resource,
      ).buffer;
    },
  };
}

export default {
  id: "video-ascii",
  controls: [
    ["columns", "Glyph columns", 24, 96, 4, 64],
    ["colorize", "Original colors", 0, 1, 1, 1],
    ["edgeMix", "Edge emphasis", 0, 1, 0.05, 0.35],
  ],
  title: "Video / image → buffers → ASCII",
  description:
    "A decoded video or image feeds an RGBA storage buffer, a luminance/Sobel compute pass and glyph-atlas rendering. Every intermediate stays on the GPU.",
  category: "Media processing",
  canvasSize: [1024, 576],
  setup,
};
