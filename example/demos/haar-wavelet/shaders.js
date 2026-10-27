// Shader functions are translated to WGSL, not executed as JavaScript.
export function haar(
  state = "array<f32>",
  next = "array<f32>",
  width = "u32",
  height = "u32",
  axis = "u32",
  inverse = "u32",
) {
  const i = threadId.x;
  if (i >= next.length) return;
  const stride = select(u32(1), width, axis == 1),
    coordinate = select(i % width, i / width, axis == 1),
    half = select(width / 2, height / 2, axis == 1),
    base = i - coordinate * stride;
  let a = f32(0),
    b = f32(0),
    detail = false;
  if (inverse == 0) {
    const pair = coordinate % half;
    a = state[base + pair * 2 * stride];
    b = state[base + (pair * 2 + 1) * stride];
    detail = coordinate >= half;
  } else {
    const pair = coordinate / 2;
    a = state[base + pair * stride];
    b = state[base + (pair + half) * stride];
    detail = coordinate % 2 == 1;
  }
  next[i] = select(a + b, a - b, detail) * 0.70710678118;
}
export function thresholdDetails(
  state = "array<f32>",
  width = "u32",
  height = "u32",
  threshold = "f32",
) {
  const i = threadId.x;
  if (
    i < state.length &&
    (i % width >= width / 2 || i / width >= height / 2) &&
    abs(state[i]) < threshold
  )
    state[i] = 0;
}

export function display(
  input = "array<f32>",
  result = "array<f32>",
  width = "u32",
  height = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const at = min(
    vec2u(vec2f(fract(uv.x * 2), uv.y) * vec2f(f32(width), f32(height))),
    vec2u(width - 1, height - 1),
  );
  const i = at.y * width + at.x;
  let value = result[i];
  if (uv.x < 0.5) value = input[i];
  return vec4f(vec3f(clamp(value, 0, 1)), 1);
}
