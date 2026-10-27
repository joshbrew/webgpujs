// Parallel prefix scan: shader functions are parsed into WGSL, never called on the CPU.

export function scanStep(
  state = "array<f32>",
  next = "array<f32>",
  offset = "u32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  let sum = state[i];
  if (i >= offset) sum += state[i - offset];
  next[i] = sum;
}

export function barsFragment(field = "array<f32>", scale = "f32") {
  const i = min(u32((position.x / resX) * f32(field.length)), field.length - 1);
  const value = field[i] / scale;
  const y = 1 - position.y / resY;
  if (y < value)
    return vec4f(0.2 + value * 0.7, 0.9 - value * 0.4, 1 - value * 0.3, 1);
  return vec4f(0.02, 0.04, 0.08, 1);
}
