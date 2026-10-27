// 2D wave equation: shader functions are parsed into WGSL, never called on the CPU.

export function waveStep(
  state = "array<vec2f>",
  next = "array<vec2f>",
  width = "u32",
  height = "u32",
  dt = "f32",
  pointer = "vec2f",
  painting = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const x = i % width;
  const y = i / width;
  const left = state[y * width + select(x, x - 1, x > 0)].x;
  const right = state[y * width + min(x + 1, width - 1)].x;
  const up = state[select(y, y - 1, y > 0) * width + x].x;
  const down = state[min(y + 1, height - 1) * width + x].x;
  const current = state[i];
  const velocity =
    (current.y + (left + right + up + down - 4 * current.x) * 0.18) * 0.995;
  const p = vec2f(f32(x) / f32(width), f32(y) / f32(height));
  const impulse = exp(-dot(p - pointer, p - pointer) * 2000) * painting * 0.15;
  next[i] = vec2f(current.x + velocity + impulse, velocity);
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
