// Compute-generated water geometry, perspective projection and reflective surface lighting.
export function waveGeometry(
  positions = "array<vec4f>",
  normals = "array<vec4f>",
  size = "u32",
  time = "f32",
  height = "f32",
) {
  const i = threadId.x;
  if (i >= positions.length) return;
  const x = (f32(i % size) / f32(size - 1) - 0.5) * 14,
    z = (f32(i / size) / f32(size - 1) - 0.5) * 14;
  const a = x * 1.4 + z * 0.7 + time,
    b = x * -0.8 + z * 1.8 - time * 1.3,
    c = x * 3.5 + z * 2.7 + time * 1.7;
  const y = (sin(a) * 0.32 + sin(b) * 0.19 + sin(c) * 0.055) * height;
  const dx = (cos(a) * 0.448 - cos(b) * 0.152 + cos(c) * 0.1925) * height;
  const dz = (cos(a) * 0.224 + cos(b) * 0.342 + cos(c) * 0.1485) * height;
  positions[i] = vec4f(x, y, z, 1);
  normals[i] = vec4f(normalize(vec3f(-dx, 1, -dz)), 0);
}
export function waterVertex(
  positions = "array<vec4f>",
  normals = "array<vec4f>",
  size = "u32",
  camera = "mat4x4f",
) {
  const corners = [
    vec2u(0, 0),
    vec2u(0, 1),
    vec2u(1, 0),
    vec2u(1, 0),
    vec2u(0, 1),
    vec2u(1, 1),
  ];
  const cell = vertexIndex / 6,
    p = vec2u(cell % (size - 1), cell / (size - 1)) + corners[vertexIndex % 6],
    i = p.y * size + p.x;
  world = positions[i].xyz;
  surfaceNormal = normals[i].xyz;
  position = camera * vec4f(world, 1);
}
export function waterNormals(
  eye = "vec3f",
  sun = "vec3f",
  roughness = "f32",
  reflection = "f32",
) {
  const n = normalize(surfaceNormal),
    view = normalize(eye - world),
    r = reflect(-view, n);
  const sky = mix(
    vec3f(0.08, 0.25, 0.45),
    vec3f(0.72, 0.86, 0.96),
    clamp(r.y * 0.5 + 0.5, 0, 1),
  );
  const fresnel = 0.03 + 0.97 * pow(1 - max(dot(n, view), 0), 5);
  const light = normalize(sun),
    glint = pow(
      max(dot(n, normalize(view + light)), 0),
      max(8, 2 / (roughness * roughness)),
    );
  const depthColour = vec3f(0.015, 0.18, 0.24) * (0.55 + 0.45 * max(n.y, 0));
  const colour =
    mix(depthColour, sky, clamp(fresnel * reflection + 0.12, 0, 1)) +
    glint * vec3f(1, 0.88, 0.65) * 1.5;
  return vec4f(colour, 1);
}
