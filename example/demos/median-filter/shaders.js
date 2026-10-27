// Shader functions are translated to WGSL, not executed as JavaScript.
export function median(
  input = "array<f32>",
  result = "array<f32>",
  width = "u32",
  height = "u32",
) {
  const i = threadId.x;
  if (i >= result.length) return;
  const x = i % width,
    y = i / width;
  const values = [
    f32(0),
    f32(0),
    f32(0),
    f32(0),
    f32(0),
    f32(0),
    f32(0),
    f32(0),
    f32(0),
  ];
  for (let yy = -1; yy <= 1; yy++)
    for (let xx = -1; xx <= 1; xx++) {
      const sx = u32(clamp(i32(x) + xx, 0, i32(width) - 1)),
        sy = u32(clamp(i32(y) + yy, 0, i32(height) - 1));
      values[(yy + 1) * 3 + xx + 1] = input[sy * width + sx];
    }
  for (let j = i32(1); j < 9; j++) {
    const value = values[j];
    let k = j - 1;
    while (k >= 0 && values[k] > value) {
      values[k + 1] = values[k];
      k--;
    }
    values[k + 1] = value;
  }
  result[i] = values[4];
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
