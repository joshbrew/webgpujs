// Stream compaction: shader functions are parsed into WGSL, never called on the CPU.

export function heatmapUnsigned(
  values = "array<u32>",
  width = "u32",
  scale = "f32",
) {
  const rows = (values.length + width - 1) / width;
  const uv = position.xy / vec2f(resX, resY);
  const p = min(
    vec2u(uv * vec2f(f32(width), f32(rows))),
    vec2u(width - 1, rows - 1),
  );
  const i = p.y * width + p.x;
  let value = f32(0);
  if (i < values.length) value = f32(values[i]) / max(scale, 0.00001);
  const grid = select(
    0.5,
    1.0,
    fract(uv.x * f32(width)) > 0.05 && fract(uv.y * f32(rows)) > 0.05,
  );
  return vec4f(
    (0.5 + 0.5 * cos(vec3f(2, 1, 0) + value * 3)) *
      grid *
      clamp(abs(value) * 2 + 0.15, 0.15, 1),
    1,
  );
}

export function heatmapFloat(
  values = "array<f32>",
  width = "u32",
  scale = "f32",
) {
  const rows = (values.length + width - 1) / width;
  const uv = position.xy / vec2f(resX, resY);
  const p = min(
    vec2u(uv * vec2f(f32(width), f32(rows))),
    vec2u(width - 1, rows - 1),
  );
  const i = p.y * width + p.x;
  let value = f32(0);
  if (i < values.length) value = values[i] / max(scale, 0.00001);
  const grid = select(
    0.5,
    1.0,
    fract(uv.x * f32(width)) > 0.05 && fract(uv.y * f32(rows)) > 0.05,
  );
  return vec4f(
    (0.5 + 0.5 * cos(vec3f(2, 1, 0) + value * 3)) *
      grid *
      clamp(abs(value) * 2 + 0.15, 0.15, 1),
    1,
  );
}

export function markSelected(
  input = "array<f32>",
  flags = "array<u32>",
  threshold = "f32",
) {
  const i = threadId.x;
  if (i < input.length) flags[i] = select(u32(0), u32(1), input[i] > threshold);
}

export function scatterSelected(
  input = "array<f32>",
  prefix = "array<u32>",
  packed = "array<f32>",
  count = "array<u32>",
) {
  const i = threadId.x;
  if (i >= input.length) return;
  let before = u32(0);
  if (i > 0) before = prefix[i - 1];
  if (prefix[i] > before) packed[prefix[i] - 1] = input[i];
  if (i == input.length - 1) count[0] = prefix[i];
}

export function scanUnsigned(
  state = "array<u32>",
  next = "array<u32>",
  offset = "u32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  let sum = state[i];
  if (i >= offset) sum += state[i - offset];
  next[i] = sum;
}
