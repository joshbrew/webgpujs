// Reaction-diffusion chemistry: shader functions are parsed into WGSL, never called on the CPU.

export function reactionStep(feed = "f32", kill = "f32") {
  const size = vec2i(textureDimensions(readState));
  const p = vec2i(threadId.xy);
  if (p.x >= size.x || p.y >= size.y) return;
  const center = textureLoad(readState, p, 0).xy;
  let laplacian = -center;
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      if (x != 0 || y != 0) {
        const coordinate = clamp(p + vec2i(x, y), vec2i(0), size - vec2i(1));
        let weight = 0.05;
        if (x == 0 || y == 0) weight = 0.2;
        laplacian += textureLoad(readState, coordinate, 0).xy * weight;
      }
    }
  }
  const reaction = center.x * center.y * center.y;
  const u = clamp(
    center.x + laplacian.x * 0.8 - reaction + feed * (1 - center.x),
    0,
    1,
  );
  const v = clamp(
    center.y + laplacian.y * 0.4 + reaction - (feed + kill) * center.y,
    0,
    1,
  );
  textureStore(writeState, p, vec4f(u, v, 0, 1));
}

export function textureVertex() {
  const corners = [vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)];
  const point = corners[vertexIndex];
  position = vec4f(point, 0, 1);
  uv = point * vec2f(0.5, -0.5) + vec2f(0.5);
}

export function reactionFragment() {
  const chemicals = textureLoad(displayState, vec2i(position.xy), 0).xy;
  const tone = clamp((chemicals.x - chemicals.y) * 1.4, 0, 1);
  const palette = mix(vec3f(0.95, 0.25, 0.5), vec3f(0.03, 0.08, 0.15), tone);
  return vec4f(palette, 1);
}
