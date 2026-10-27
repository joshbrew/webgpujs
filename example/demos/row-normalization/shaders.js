// Shader functions are translated to WGSL, not executed as JavaScript.
export function rowStats(
  input = "array<f32>",
  stats = "array<vec2f>",
  width = "u32",
) {
  const row = threadId.x;
  if (row >= stats.length) return;
  let mean = f32(0);
  for (let j = u32(0); j < width; j++) mean += input[row * width + j];
  mean /= f32(width);
  let variance = f32(0);
  for (let j = u32(0); j < width; j++) {
    const delta = input[row * width + j] - mean;
    variance += delta * delta;
  }
  stats[row] = vec2f(mean, inverseSqrt(variance / f32(width) + 0.00001));
}
export function standardize(
  input = "array<f32>",
  stats = "array<vec2f>",
  result = "array<f32>",
  width = "u32",
) {
  const i = threadId.x;
  if (i < input.length) {
    const s = stats[i / width];
    result[i] = (input[i] - s.x) * s.y;
  }
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
