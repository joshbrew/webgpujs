// N-body gravity: shader functions are parsed into WGSL, never called on the CPU.

export function nbodyStep(
  state = "array<vec4f>",
  next = "array<vec4f>",
  width = "u32",
  height = "u32",
  dt = "f32",
  pointer = "vec2f",
  attracting = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const current = state[i];
  let force = vec2f(0);
  const deltaPointer = vec2f(pointer.x * 2 - 1, 1 - pointer.y * 2) - current.xy;
  force +=
    (deltaPointer * attracting * 0.1) /
    max(dot(deltaPointer, deltaPointer), 0.03);
  for (let j = 0; j < state.length; j++) {
    const delta = state[j].xy - current.xy;
    const inv = inverseSqrt(dot(delta, delta) + 0.015);
    force += delta * inv * inv * inv * 0.00002;
  }
  const velocity = current.zw + force * dt;
  next[i] = vec4f(current.xy + velocity * dt, velocity);
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
