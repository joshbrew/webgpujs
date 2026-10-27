// Polar tunnel
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { polarTunnel } from "./shaders.js";

const demoDefinition = {
  id: "tunnel",
  interactive: true,
  controls: [
    ["zoom", "Zoom", 0.5, 3, 0.05, 1],
    ["twist", "Tunnel twist", -1, 1, 0.05, 0.15],
  ],
  interactionHint:
    "Move the pointer to steer the vanishing point; change Zoom and Tunnel twist to bend the passage.",
  title: "Polar tunnel",
  description:
    "Steer a twisting 3D-looking passage with the pointer, with adjustable zoom and spiral distortion.",
  shader: polarTunnel,
  category: "Fragment studies",
};

export async function setup(canvas, device, options = {}) {
  const definition = { ...demoDefinition, ...options };
  const pipeline = await WebGPUjs.createPipeline(definition.shader, {
    device,
    canvas,
    renderPass: { vbos: [], vertexCount: 3 },
  });
  async function frame(time, controls = {}) {
    await pipeline.render({
      inputs: {
        time: time / 1000,
        zoom: controls.zoom ?? 1,
        pointer: controls.pointer ?? [0, 0],
        twist: controls.twist ?? 0.15,
      },
    });
  }
  return { pipelines: [pipeline], frame };
}

export default { ...demoDefinition, setup };
