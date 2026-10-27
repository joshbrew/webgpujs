// Summed-area table → box queries: shader functions are parsed into WGSL, never called on the CPU.

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

export function scanImage(
  state = "array<f32>",
  next = "array<f32>",
  width = "u32",
  offset = "u32",
  axis = "u32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const x = i % width;
  const y = i / width;
  let sum = state[i];
  if (axis == 0 && x >= offset) sum += state[i - offset];
  if (axis == 1 && y >= offset) sum += state[i - offset * width];
  next[i] = sum;
}

export function boxAverage(
  integral = "array<f32>",
  result = "array<f32>",
  width = "u32",
  radius = "u32",
) {
  const i = threadId.x;
  if (i >= result.length) return;
  const x = i % width;
  const y = i / width;
  const x0 = max(i32(x) - i32(radius), 0);
  const y0 = max(i32(y) - i32(radius), 0);
  const x1 = min(x + radius, width - 1);
  const y1 = min(y + radius, width - 1);
  let sum = integral[y1 * width + x1];
  if (x0 > 0) sum -= integral[y1 * width + u32(x0 - 1)];
  if (y0 > 0) sum -= integral[u32(y0 - 1) * width + x1];
  if (x0 > 0 && y0 > 0) sum += integral[u32(y0 - 1) * width + u32(x0 - 1)];
  result[i] = sum / f32((x1 - u32(x0) + 1) * (y1 - u32(y0) + 1));
}
