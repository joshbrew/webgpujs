import { WebGPUjs } from "../dist/webgpujs.esm.js";
export async function checkExternalFrames() {
  const status = document.querySelector("#status");
  let device, pipeline;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    device = await adapter.requestDevice();
    device.pushErrorScope("validation");
    pipeline = await WebGPUjs.createPipeline(
      function sampleFrame(
        video = "texture_external",
        videoSampler = "sampler",
      ) {
        return textureSampleBaseClampToEdge(video, videoSampler, vec2f(0.5));
      },
      {
        device,
        canvas: document.querySelector("canvas"),
        contextSettings: {
          device,
          format: navigator.gpu.getPreferredCanvasFormat(),
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        },
        renderPass: { vbos: [], vertexCount: 3 },
      },
    );
    const source = new OffscreenCanvas(16, 16),
      context = source.getContext("2d");
    const checks = [];
    for (const color of ["rgb(0,255,0)", "rgb(255,255,255)"]) {
      context.fillStyle = color;
      context.fillRect(0, 0, 16, 16);
      const frame = new VideoFrame(source, { timestamp: 0 });
      const encoder = device.createCommandEncoder();
      await pipeline.render({ commandEncoder: encoder }, frame);
      const pixels = await pipeline.fragment.getOutputData(encoder, {
        image: pipeline.context.getCurrentTexture(),
      });
      checks.push([...pixels.slice(0, 4)]);
      frame.close();
    }
    const error = await device.popErrorScope();
    if (error) throw new Error(error.message);
    if (
      checks[0][1] < 250 ||
      checks[0][0] > 5 ||
      checks[1].slice(0, 3).some((v) => v < 250)
    )
      throw new Error(JSON.stringify(checks));
    status.textContent =
      "PASS: two VideoFrames imported, sampled and refreshed. " +
      JSON.stringify(checks);
    status.dataset.result = "pass";
  } catch (error) {
    status.textContent = "FAIL: " + error.message;
    status.dataset.result = "fail";
  } finally {
    pipeline?.dispose();
    device?.destroy();
  }
}
