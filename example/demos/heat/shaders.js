// Heat diffusion: shader functions are parsed into WGSL, never called on the CPU.

export function heatStep(
  state = "array<vec2f>",
  next = "array<vec2f>",
  width = "u32",
  height = "u32",
  dt = "f32",
  pointer = "vec2f",
  force = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const x = i % width;
  const y = i / width;
  const l = y * width + ((x + width - 1) % width);
  const r = y * width + ((x + 1) % width);
  const u = ((y + height - 1) % height) * width + x;
  const d = ((y + 1) % height) * width + x;
  let value =
    state[i].x +
    (state[l].x + state[r].x + state[u].x + state[d].x - 4 * state[i].x) * dt;
  value *= 0.999;
  const p = vec2f(f32(x) / f32(width), f32(y) / f32(height));
  value += exp(-dot(p - pointer, p - pointer) * 1800) * force * 0.3;
  next[i] = vec2f(value, 0);
}

export function waveFragment(
  field = "array<vec2f>",
  width = "u32",
  height = "u32",
) {
  const p = vec2u(
    (position.xy / vec2f(resX, resY)) * vec2f(f32(width), f32(height)),
  );
  const value = field[min(p.y, height - 1) * width + min(p.x, width - 1)].x;
  return vec4f(0.5 + 0.5 * cos(vec3f(0, 2, 4) + value * 9), 1);
}
