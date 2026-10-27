// Workgroup parallel reduction: shader functions are parsed into WGSL, never called on the CPU.

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

export function reduceWorkgroup(
  sourceValues = "array<f32>",
  partials = "array<f32>",
) {
  let value = f32(0);
  if (threadId.x < sourceValues.length) value = sourceValues[threadId.x];
  scratch[localIndex] = value;
  workgroupBarrier();
  for (let stride = u32(32); stride > 0; stride /= 2) {
    if (localIndex < stride)
      scratch[localIndex] += scratch[localIndex + stride];
    workgroupBarrier();
  }
  if (localIndex == 0) partials[workgroupId.x] = scratch[0];
}
