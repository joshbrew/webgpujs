// Crystal meadow · a playable scene: shader functions are parsed into WGSL, never called on the CPU.

export function buildTerrain(land = "array<vec4f>", width = "u32") {
  const i = threadId.x;
  if (i >= land.length) return;
  const x = (f32(i % width) / f32(width - 1)) * 16 - 8;
  const z = (f32(i / width) / f32(width - 1)) * 16 - 8;
  const h = sin(x * 0.6) * cos(z * 0.5) * 0.35;
  const n = normalize(
    vec3f(
      -0.21 * cos(x * 0.6) * cos(z * 0.5),
      1,
      0.175 * sin(x * 0.6) * sin(z * 0.5),
    ),
  );
  land[i] = vec4f(h, n);
}

export function terrainVertex(
  land = "array<vec4f>",
  width = "u32",
  camera = "mat4x4f",
) {
  const corners = [
    vec2u(0, 0),
    vec2u(1, 0),
    vec2u(0, 1),
    vec2u(0, 1),
    vec2u(1, 0),
    vec2u(1, 1),
  ];
  const p =
    vec2u(instanceIndex % (width - 1), instanceIndex / (width - 1)) +
    corners[vertexIndex];
  const sample = land[p.y * width + p.x];
  const world = vec3f(
    (f32(p.x) / f32(width - 1)) * 16 - 8,
    sample.x,
    (f32(p.y) / f32(width - 1)) * 16 - 8,
  );
  position = camera * vec4f(world, 1);
  normal = sample.yzw;
  worldPos = world;
  const checker = select(0.85, 1.0, (p.x / 4 + p.y / 4) % 2 == 0);
  color = vec4f(vec3f(0.15, 0.5, 0.35) * checker, 1);
}

export function litFragment(sun = "vec3f", eye = "vec3f") {
  const n = normalize(normal);
  const light = normalize(sun);
  const diffuse = max(dot(n, light), 0);
  const view = normalize(eye - worldPos);
  const spec = pow(max(dot(n, normalize(light + view)), 0), 32) * 0.25;
  const shaded = color.rgb * (0.25 + diffuse * 0.85) + vec3f(spec);
  const fog = smoothstep(10.0, 28.0, distance(eye, worldPos));
  return vec4f(mix(shaded, vec3f(0.08, 0.14, 0.22), fog), 1);
}

export function actorVertex(
  camera = "mat4x4f",
  player = "vec4f",
  tokens = "array<vec4f>",
  time = "f32",
) {
  const corners = [
    vec3f(-1, -1, -1),
    vec3f(1, -1, -1),
    vec3f(-1, 1, -1),
    vec3f(1, 1, -1),
    vec3f(-1, -1, 1),
    vec3f(1, -1, 1),
    vec3f(-1, 1, 1),
    vec3f(1, 1, 1),
  ];
  const indices = [
    0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 4, 2, 4, 6, 2, 1, 3, 5, 5, 3, 7, 2,
    6, 3, 6, 7, 3, 0, 1, 4, 1, 5, 4,
  ];
  const normals = [
    vec3f(0, 0, -1),
    vec3f(0, 0, 1),
    vec3f(-1, 0, 0),
    vec3f(1, 0, 0),
    vec3f(0, 1, 0),
    vec3f(0, -1, 0),
  ];
  let p = corners[indices[vertexIndex]];
  let n = normals[vertexIndex / 6];
  let center = vec3f(player.x, 0, player.y);
  let angle = player.z;
  let tint = vec3f(0.2, 0.75, 1);
  if (instanceIndex < 4) {
    if (instanceIndex < 2) {
      p *= vec3f(0.11, 0.22, 0.12);
      p += vec3f(
        (f32(instanceIndex) * 2 - 1) * 0.14,
        0.25,
        sin(time * 12 + f32(instanceIndex) * 3.14159) * player.w * 0.14,
      );
      tint = vec3f(0.12, 0.18, 0.35);
    } else if (instanceIndex == 2) {
      p *= vec3f(0.28, 0.3, 0.16);
      p.y += 0.7;
    } else {
      p *= vec3f(0.2);
      p.y += 1.19;
      tint = vec3f(1, 0.75, 0.5);
    }
    center.y = sin(center.x * 0.6) * cos(center.z * 0.5) * 0.35;
  } else {
    const token = tokens[instanceIndex - 4];
    center = token.xyz;
    if (token.w < 0.5) center.y = -20;
    p *= vec3f(0.15, 0.22, 0.15);
    p.y += sin(time * 2 + f32(instanceIndex)) * 0.12;
    angle = time;
    tint = vec3f(1, 0.65, 0.08);
  }
  p = vec3f(
    cos(angle) * p.x + sin(angle) * p.z,
    p.y,
    -sin(angle) * p.x + cos(angle) * p.z,
  );
  n = vec3f(
    cos(angle) * n.x + sin(angle) * n.z,
    n.y,
    -sin(angle) * n.x + cos(angle) * n.z,
  );
  worldPos = center + p;
  normal = n;
  color = vec4f(tint, 1);
  position = camera * vec4f(worldPos, 1);
}
