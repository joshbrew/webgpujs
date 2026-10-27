// Excitable medium: shader functions are parsed into WGSL, never called on the CPU.

export function excitableStep(
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
  const v = state[i];
  const lap =
    state[y * width + ((x + width - 1) % width)].x +
    state[y * width + ((x + 1) % width)].x +
    state[((y + height - 1) % height) * width + x].x +
    state[((y + 1) % height) * width + x].x -
    4 * v.x;
  const p = vec2f(f32(x) / f32(width), f32(y) / f32(height));
  const stimulus = exp(-dot(p - pointer, p - pointer) * 1600) * force;
  const du = lap * 0.8 + v.x - v.x * v.x * v.x - v.y + stimulus;
  next[i] = clamp(
    v + vec2f(du, (v.x + 0.7 - 0.8 * v.y) * 0.08) * dt,
    vec2f(-2),
    vec2f(2),
  );
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
