// Spring cloth: shader functions are parsed into WGSL, never called on the CPU.

export function clothStep(
  state = "array<vec4f>",
  next = "array<vec4f>",
  width = "u32",
  height = "u32",
  dt = "f32",
  pointer = "vec2f",
  grabbing = "f32",
  wind = "f32",
  time = "f32",
) {
  function spring(a = "vec2f", b = "vec2f", rest = "f32") {
    const delta = b - a;
    const distance = max(length(delta), 0.00001);
    return (delta / distance) * (distance - rest) * 220;
  }
  const i = threadId.x;
  if (i >= state.length) return;
  const x = i % width;
  const y = i / width;
  const current = state[i];
  if (y == 0 && (x == 0 || x == width - 1)) {
    next[i] = current;
    return;
  }
  let force = vec2f(sin(time * 2 + f32(y) * 0.3) * wind * 0.12, -0.08);
  const anchorPoint = vec2f(pointer.x * 2 - 1, 1 - pointer.y * 2);
  const delta = anchorPoint - current.xy;
  if (grabbing > 0) force += delta * exp(-dot(delta, delta) * 6) * 18;
  const rest = 1.6 / f32(width - 1);
  if (x > 0) force += spring(current.xy, state[i - 1].xy, rest);
  if (x + 1 < width) force += spring(current.xy, state[i + 1].xy, rest);
  if (y > 0) force += spring(current.xy, state[i - width].xy, rest);
  if (y + 1 < height) force += spring(current.xy, state[i + width].xy, rest);
  const velocity = clamp(
    (current.zw + force * dt) * 0.985,
    vec2f(-2),
    vec2f(2),
  );
  next[i] = vec4f(current.xy + velocity * dt, velocity);
}

export function clothVertex(
  points = "array<vec4f>",
  width = "u32",
  height = "u32",
) {
  const corners = [
    vec2u(0, 0),
    vec2u(1, 0),
    vec2u(0, 1),
    vec2u(0, 1),
    vec2u(1, 0),
    vec2u(1, 1),
  ];
  const offset = corners[vertexIndex];
  const x = (instanceIndex % (width - 1)) + offset.x;
  const y = instanceIndex / (width - 1) + offset.y;
  const point = points[y * width + x];
  position = vec4f(point.xy, 0, 1);
  const grid = select(0.55, 1.0, (x + y) % 2 == 0);
  color = vec4f(
    vec3f(
      0.2 + (f32(x) / f32(width)) * 0.6,
      0.5 + (f32(y) / f32(height)) * 0.4,
      0.9,
    ) * grid,
    1,
  );
}

export function particleFragment(exposure = "f32") {
  return vec4f(color.rgb * exposure, 1);
}
