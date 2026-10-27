export function clear(args = "array<atomic<u32>>") {
  if (threadId.x == 0) {
    atomicStore(args[0], 6);
    atomicStore(args[1], 0);
    atomicStore(args[2], 0);
    atomicStore(args[3], 0);
  }
}
export function cull(
  points = "array<vec4f>",
  visible = "array<u32>",
  args = "array<atomic<u32>>",
  center = "vec2f",
  radius = "f32",
) {
  const i = threadId.x;
  if (i >= points.length) return;
  if (distance(points[i].xy, center) < radius) {
    const slot = atomicAdd(args[1], 1);
    visible[slot] = i;
  }
}
export function particles(points = "array<vec4f>", visible = "array<u32>") {
  const corners = [
    vec2f(-1, -1),
    vec2f(1, -1),
    vec2f(-1, 1),
    vec2f(-1, 1),
    vec2f(1, -1),
    vec2f(1, 1),
  ];
  const point = points[visible[instanceIndex]];
  position = vec4f(point.xy + corners[vertexIndex] * 0.012, 0, 1);
  color = vec4f(0.2 + point.z * 0.7, 0.8, 1 - point.z * 0.6, 1);
}
export function shade() {
  return color;
}
