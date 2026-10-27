// Crystal meadow · a playable scene
// Setup and update are independent of the gallery. Call setup(canvas, device), then demo.frame(timeInMilliseconds, controls).
import { WebGPUjs } from "../../../src/pipeline";
import { mat4 } from "wgpu-matrix";
import {
  buildTerrain,
  terrainVertex,
  litFragment,
  actorVertex,
} from "./shaders.js";

const demoDefinition = {
  id: "game",
  controls: [
    ["walkSpeed", "Walking speed", 1, 5, 0.1, 2.5],
    ["sun", "Sun direction", 0, 6.28, 0.05, 0.8],
  ],
  title: "Crystal meadow · a playable scene",
  description:
    "Compute builds the terrain; two geometry passes share depth and apply diffuse, specular and fog lighting. Walk around and collect 12 golden crystals.",
  category: "Multi-shader game",
};

function terrainHeight(x, z) {
  return Math.sin(x * 0.6) * Math.cos(z * 0.5) * 0.35;
}

export async function setup(canvas, device, options = {}) {
  const width = 49;
  const varyings = [{ color: "vec4f", normal: "vec3f", worldPos: "vec3f" }];
  const terrain = await WebGPUjs.createPipeline(
    { compute: buildTerrain, vertex: terrainVertex, fragment: litFragment },
    {
      device,
      canvas,
      shaderBindings: {
        compute: { land: { resource: "game-terrain" } },
        vertex: { land: { resource: "game-terrain" } },
      },
      computePass: { skipOutputDef: true },
      renderPass: {
        vbos: varyings,
        vertexCount: 6,
        instanceCount: (width - 1) ** 2,
      },
    },
  );
  await terrain.process(new Float32Array(width * width * 4), width);
  const actors = await WebGPUjs.combineShaders(
    { vertex: actorVertex, fragment: litFragment },
    {
      canvas,
      renderPass: { vbos: varyings, vertexCount: 36, instanceCount: 16 },
    },
    terrain,
  );
  // Composite the second geometry pass using the first pass's colour and depth.
  actors.fragment.depthTexture = terrain.fragment.depthTexture;
  actors.fragment.renderPassDescriptor.colorAttachments[0].loadOp = "load";
  actors.fragment.renderPassDescriptor.depthStencilAttachment.depthLoadOp =
    "load";
  terrain.fragment.renderPassDescriptor.colorAttachments[0].clearValue = {
    r: 0.08,
    g: 0.14,
    b: 0.22,
    a: 1,
  };
  const player = [0, 0, 0, 0];
  const tokens = new Float32Array(12 * 4);
  const heldKeys = new Set();
  const events = new AbortController();
  if (canvas.addEventListener && canvas.setAttribute) {
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "Crystal meadow. Click to walk, or use WASD / arrow keys.",
    );
    canvas.addEventListener(
      "keydown",
      (event) => {
        const key = event.key.toLowerCase();
        if (
          [
            "w",
            "a",
            "s",
            "d",
            "arrowup",
            "arrowdown",
            "arrowleft",
            "arrowright",
          ].includes(key)
        ) {
          event.preventDefault();
          heldKeys.add(key);
        }
      },
      { signal: events.signal },
    );
    canvas.addEventListener(
      "keyup",
      (event) => heldKeys.delete(event.key.toLowerCase()),
      { signal: events.signal },
    );
    canvas.addEventListener("blur", () => heldKeys.clear(), {
      signal: events.signal,
    });
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        canvas.focus({ preventScroll: true });
        const rect = canvas.getBoundingClientRect();
        pointer(
          (event.clientX - rect.left) / rect.width,
          (event.clientY - rect.top) / rect.height,
        );
      },
      { signal: events.signal },
    );
  }
  let score = 0,
    last = null,
    destination = null;
  function reset() {
    player.fill(0);
    score = 0;
    last = null;
    destination = null;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x = Math.cos(angle) * (2.5 + (i % 3) * 1.3),
        z = Math.sin(angle) * (2.5 + (i % 3) * 1.3);
      tokens.set([x, terrainHeight(x, z) + 0.65, z, 1], i * 4);
    }
  }
  reset();
  async function frame(time, controls = {}) {
    const dt =
      last === null ? 0 : Math.max(0, Math.min((time - last) / 1000, 0.05));
    last = time;
    const keys = controls.keys || heldKeys;
    let dx =
      Number(keys.has("d") || keys.has("arrowright")) -
      Number(keys.has("a") || keys.has("arrowleft"));
    let dz =
      Number(keys.has("s") || keys.has("arrowdown")) -
      Number(keys.has("w") || keys.has("arrowup"));
    if (dx || dz) destination = null;
    if (controls.target) {
      destination = controls.target;
      controls.target = null;
    }
    if (destination) {
      dx = destination[0] - player[0];
      dz = destination[1] - player[1];
      if (Math.hypot(dx, dz) < 0.12) {
        destination = null;
        dx = 0;
        dz = 0;
      }
    }
    const length = Math.hypot(dx, dz);
    player[3] = length > 0 ? 1 : 0;
    if (length > 0) {
      const speed = controls.walkSpeed ?? 2.5;
      player[0] = Math.max(
        -7,
        Math.min(7, player[0] + (dx / length) * dt * speed),
      );
      player[1] = Math.max(
        -7,
        Math.min(7, player[1] + (dz / length) * dt * speed),
      );
      player[2] = Math.atan2(dx, dz);
    }
    for (let i = 0; i < 12; i++)
      if (
        tokens[i * 4 + 3] &&
        Math.hypot(tokens[i * 4] - player[0], tokens[i * 4 + 2] - player[1]) <
          0.6
      ) {
        tokens[i * 4 + 3] = 0;
        score++;
      }
    const eye = [player[0], 8, player[1] + 9];
    const camera = mat4.multiply(
      mat4.perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 60),
      mat4.lookAt(eye, [player[0], 0, player[1]], [0, 1, 0]),
    );
    const angle = controls.sun ?? 0.8;
    const sun = [Math.cos(angle), 0.9, Math.sin(angle)];
    await terrain.render({}, undefined, width, camera, sun, eye);
    await actors.render({}, camera, player, tokens, time / 1000, sun, eye);
  }
  function pointer(x, y) {
    // Unproject the screen ray and intersect the walkable ground plane.
    const eye = [player[0], 8, player[1] + 9];
    const view = mat4.multiply(
      mat4.perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 60),
      mat4.lookAt(eye, [player[0], 0, player[1]], [0, 1, 0]),
    );
    const inverse = mat4.inverse(view);
    const transform = (z) => {
      const v = [x * 2 - 1, 1 - y * 2, z, 1],
        out = [0, 0, 0, 0];
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++)
          out[row] += inverse[col * 4 + row] * v[col];
      return out.slice(0, 3).map((n) => n / out[3]);
    };
    const near = transform(0),
      far = transform(1);
    const t = -near[1] / (far[1] - near[1]);
    if (t > 0)
      destination = [
        Math.max(-7, Math.min(7, near[0] + (far[0] - near[0]) * t)),
        Math.max(-7, Math.min(7, near[2] + (far[2] - near[2]) * t)),
      ];
  }
  return {
    pipelines: [terrain, actors],
    frame,
    reset,
    pointer,
    dispose: () => events.abort(),
    get score() {
      return score;
    },
    get player() {
      return [...player];
    },
    info: "Collect 12 golden crystals. Click the scene, or focus it and use WASD / arrow keys.",
  };
}

export default { ...demoDefinition, setup };

export { terrainHeight };
