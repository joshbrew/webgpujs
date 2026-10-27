// Shader functions are translated to WGSL, not executed as JavaScript.
export function convolve(
  input = "array<f32>",
  kernel = "array<f32>",
  result = "array<f32>",
  width = "u32",
  height = "u32",
) {
  const i = threadId.x;
  if (i >= result.length) return;
  const x = i % width,
    y = i / width;
  let sum = f32(0);
  for (let yy = -1; yy <= 1; yy++)
    for (let xx = -1; xx <= 1; xx++) {
      const sx = u32(clamp(i32(x) + xx, 0, i32(width) - 1)),
        sy = u32(clamp(i32(y) + yy, 0, i32(height) - 1));
      sum += input[sy * width + sx] * kernel[(yy + 1) * 3 + xx + 1];
    }
  result[i] = sum;
}

export function display(
  input = "array<f32>",
  result = "array<f32>",
  width = "u32",
  height = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const p = min(
    vec2u(vec2f(fract(uv.x * 2), uv.y) * vec2f(f32(width), f32(height))),
    vec2u(width - 1, height - 1),
  );
  const i = p.y * width + p.x;
  let value = result[i];
  if (uv.x < 0.5) value = input[i];
  return vec4f(vec3f(clamp(value, 0, 1)), 1);
}
