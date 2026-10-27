export function workload(values = "array<f32>", iterations = "u32") {
  const i = threadId.x;
  if (i >= values.length) return;
  let value = values[i];
  for (let j = u32(0); j < iterations; j++)
    value = sin(value * 1.1 + f32(j) * 0.01);
  values[i] = value;
}
export function display(values = "array<f32>") {
  const uv = position.xy / vec2f(resX, resY),
    p = min(vec2u(uv * 256), vec2u(255)),
    i = p.y * 256 + p.x;
  const value = values[i];
  return vec4f(
    0.05 + abs(value) * 0.3,
    0.1 + value * 0.7,
    0.35 + value * 0.35,
    1,
  );
}
