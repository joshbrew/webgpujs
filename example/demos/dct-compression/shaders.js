// Shader functions are translated to WGSL, not executed as JavaScript.
export function forwardDCT(
  input = "array<f32>",
  coefficients = "array<f32>",
  width = "u32",
) {
  const i = threadId.x;
  if (i >= coefficients.length) return;
  const u = (i % width) % 8,
    v = (i / width) % 8,
    bx = ((i % width) / 8) * 8,
    by = (i / width / 8) * 8;
  let sum = f32(0);
  for (let y = u32(0); y < 8; y++)
    for (let x = u32(0); x < 8; x++)
      sum +=
        input[(by + y) * width + bx + x] *
        cos((Math.PI * (f32(x) + 0.5) * f32(u)) / 8) *
        cos((Math.PI * (f32(y) + 0.5) * f32(v)) / 8);
  coefficients[i] =
    0.25 *
    select(1.0, 0.70710678118, u == 0) *
    select(1.0, 0.70710678118, v == 0) *
    sum;
}
export function quantize(coefficients = "array<f32>", quantization = "f32") {
  const i = threadId.x;
  if (i < coefficients.length)
    coefficients[i] = round(coefficients[i] / quantization) * quantization;
}
export function inverseDCT(
  coefficients = "array<f32>",
  result = "array<f32>",
  width = "u32",
) {
  const i = threadId.x;
  if (i >= result.length) return;
  const x = (i % width) % 8,
    y = (i / width) % 8,
    bx = ((i % width) / 8) * 8,
    by = (i / width / 8) * 8;
  let sum = f32(0);
  for (let v = u32(0); v < 8; v++)
    for (let u = u32(0); u < 8; u++)
      sum +=
        select(1.0, 0.70710678118, u == 0) *
        select(1.0, 0.70710678118, v == 0) *
        coefficients[(by + v) * width + bx + u] *
        cos((Math.PI * (f32(x) + 0.5) * f32(u)) / 8) *
        cos((Math.PI * (f32(y) + 0.5) * f32(v)) / 8);
  result[i] = sum * 0.25;
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
