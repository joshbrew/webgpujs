export function display(
  environment = "texture_cube<f32>",
  environmentSampler = "sampler",
  angle = "f32",
) {
  const uv = position.xy / vec2f(resX, resY),
    p = (uv - vec2f(0.5)) * vec2f((resX / resY) * 2, 2);
  const r2 = dot(p, p);
  let direction = normalize(vec3f(p, 1));
  let gain = f32(0.2);
  if (r2 < 0.64) {
    const normal = vec3f(p, sqrt(0.64 - r2)) / 0.8;
    direction = reflect(normalize(vec3f(p, -2)), normal);
    gain = 1;
  }
  const rotated = vec3f(
    direction.x * cos(angle) + direction.z * sin(angle),
    direction.y,
    -direction.x * sin(angle) + direction.z * cos(angle),
  );
  return vec4f(
    textureSampleLevel(environment, environmentSampler, rotated, 0).rgb * gain,
    1,
  );
}
