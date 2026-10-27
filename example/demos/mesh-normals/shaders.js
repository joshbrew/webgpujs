export function surface(
  positions = "array<vec4f>",
  normals = "array<vec4f>",
  time = "f32",
  amplitude = "f32",
) {
  const i = threadId.x;
  if (i >= positions.length) return;
  const x = (f32(i % 64) / 63) * 4 - 2;
  const z = (f32(i / 64) / 63) * 4 - 2;
  const y = sin(x * 2 + time) * cos(z * 2 - time) * amplitude;
  const dx = 2 * cos(x * 2 + time) * cos(z * 2 - time) * amplitude;
  const dz = -2 * sin(x * 2 + time) * sin(z * 2 - time) * amplitude;
  positions[i] = vec4f(x, y, z, 1);
  normals[i] = vec4f(normalize(vec3f(-dx, 1, -dz)), 0);
}
export function mesh(
  vertices = "array<vec4f>",
  normalData = "array<vec4f>",
  projection = "mat4x4f",
) {
  const corners = [
    vec2u(0, 0),
    vec2u(0, 1),
    vec2u(1, 0),
    vec2u(1, 0),
    vec2u(0, 1),
    vec2u(1, 1),
  ];
  const cell = vertexIndex / 6;
  const p = vec2u(cell % 63, cell / 63) + corners[vertexIndex % 6];
  const i = p.y * 64 + p.x;
  position = projection * vertices[i];
  normal = normalData[i].xyz;
  tint = vec3f(0.15, 0.5 + vertices[i].y * 0.25, 0.7);
}
export function shade() {
  const light = max(dot(normalize(normal), normalize(vec3f(-0.5, 1, 0.6))), 0);
  return vec4f(tint * (0.15 + 0.85 * light), 1);
}
