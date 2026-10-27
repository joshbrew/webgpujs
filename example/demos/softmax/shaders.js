// Shader functions are translated to WGSL, not executed as JavaScript.
export function reduceMaximum(input = "array<f32>", peak = "array<f32>") {
  if (threadId.x > 0) return;
  let m = f32(-1e30);
  for (let j = 0; j < input.length; j++) m = max(m, input[j]);
  peak[0] = m;
}
export function exponentiate(
  input = "array<f32>",
  peak = "array<f32>",
  weights = "array<f32>",
  temperature = "f32",
) {
  const i = threadId.x;
  if (i < input.length) weights[i] = exp((input[i] - peak[0]) / temperature);
}
export function reduceSum(
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
export function normalize(
  weights = "array<f32>",
  total = "array<f32>",
  result = "array<f32>",
) {
  const i = threadId.x;
  if (i < weights.length) result[i] = weights[i] / max(total[0], 0.00001);
}

export function display(
  values = "array<f32>",
  columns = "u32",
  scale = "f32",
  hoverIndex = "i32",
  viewMode = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const rows = (values.length + columns - 1) / columns;
  const cell = min(
    vec2u(uv * vec2f(f32(columns), f32(rows))),
    vec2u(columns - 1, rows - 1),
  );
  let i = min(cell.y * columns + cell.x, values.length - 1);
  if (viewMode == 1) i = min(u32(uv.x * f32(values.length)), values.length - 1);
  const value = values[i] * scale;
  const positive = clamp(value, 0, 1),
    negative = clamp(-value, 0, 1);
  let colour =
    vec3f(0.025, 0.05, 0.09) +
    positive * vec3f(0.15, 0.9, 0.7) +
    negative * vec3f(0.95, 0.3, 0.35);
  if (viewMode == 0) {
    const grid =
      step(0.04, fract(uv.x * f32(columns))) *
      step(0.04, fract(uv.y * f32(rows)));
    colour *= grid;
  } else {
    const y = 0.5 - value * 0.45;
    const filled = uv.y >= min(0.5, y) && uv.y <= max(0.5, y);
    colour = select(vec3f(0.025, 0.05, 0.09), colour, filled);
    if (abs(uv.y - 0.5) < 0.003) colour = vec3f(0.2, 0.3, 0.4);
  }
  if (i32(i) == hoverIndex) colour = mix(colour, vec3f(1, 0.86, 0.4), 0.35);
  return vec4f(colour, 1);
}
