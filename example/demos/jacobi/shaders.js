export function relax(
  current = "array<f32>",
  next = "array<f32>",
  forcing = "array<f32>",
  iteration = "u32",
  iterations = "u32",
) {
  const i = threadId.x;
  if (i >= next.length) return;
  if (iteration >= iterations) {
    next[i] = current[i];
    return;
  }
  let left = f32(0),
    right = f32(0);
  if (i > 0) left = current[i - 1];
  if (i + 1 < current.length) right = current[i + 1];
  next[i] = 0.5 * (forcing[i] + left + right);
}
export function display(
  values = "array<f32>",
  forcing = "array<f32>",
  hoverIndex = "i32",
) {
  const uv = position.xy / vec2f(resX, resY),
    i = min(u32(uv.x * f32(values.length)), values.length - 1);
  let colour = vec3f(0.025, 0.045, 0.08),
    left = f32(0),
    right = f32(0);
  if (i > 0) left = values[i - 1];
  if (i + 1 < values.length) right = values[i + 1];
  const residual = 2 * values[i] - left - right - forcing[i];
  if (
    abs(uv.y - 0.2) < 0.002 ||
    abs(uv.y - 0.5) < 0.002 ||
    abs(uv.y - 0.82) < 0.002
  )
    colour = vec3f(0.15, 0.22, 0.3);
  if (abs(uv.y - (0.2 - forcing[i] * 0.07)) < 0.006)
    colour = vec3f(1, 0.7, 0.25);
  if (abs(uv.y - (0.55 - values[i] * 0.0065)) < 0.006)
    colour = vec3f(0.2, 0.9, 0.8);
  if (abs(uv.y - (0.82 - residual * 0.09)) < 0.006)
    colour = vec3f(1, 0.4, 0.45);
  if (i32(i) == hoverIndex) colour += vec3f(0.12, 0.1, 0.03);
  return vec4f(colour, 1);
}
