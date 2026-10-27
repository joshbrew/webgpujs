// Explicit particle field: shader functions are parsed into WGSL, never called on the CPU.

export function particleField(state = "array<vec4f>", time = "f32") {
  const i = threadId.x;
  if (i >= state.length) return;
  const x = (f32(i % 64) / 63) * 1.8 - 0.9;
  const y = (f32(i / 64) / 31) * 1.6 - 0.8;
  const ripple = sin(x * 5 + time) * cos(y * 5 - time) * 0.09;
  state[i] = vec4f(
    x + ripple,
    y + ripple,
    0.5 + 0.5 * sin(x * 3 + y * 4 + time),
    1,
  );
}

export function particleVertex(points = "array<vec4f>") {
  const corners = [
    vec2f(-1, -1),
    vec2f(1, -1),
    vec2f(-1, 1),
    vec2f(-1, 1),
    vec2f(1, -1),
    vec2f(1, 1),
  ];
  const p = points[instanceIndex];
  position = vec4f(p.xy + corners[vertexIndex] * 0.009, 0, 1);
  color = vec4f(0.15 + p.z * 0.8, 0.8 - p.z * 0.5, 1 - p.z * 0.2, 1);
}

export function particleFragment(exposure = "f32") {
  return vec4f(color.rgb * exposure, 1);
}
