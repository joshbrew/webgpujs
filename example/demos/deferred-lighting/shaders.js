export function geometry(radius = "f32") {
  const p = ((position.xy / vec2f(resX, resY)) * 2 - 1) * vec2f(resX / resY, 1);
  let n = vec3f(0, 0, 1),
    a = vec4f(0.025, 0.04, 0.065, 0);
  for (let i = 0; i < 3; i++) {
    const q = p - vec2f(f32(i - 1) * 0.75, 0);
    const d = dot(q, q);
    if (d < radius * radius) {
      n = normalize(vec3f(q, sqrt(radius * radius - d)));
      a = vec4f(
        0.25 + f32(i) * 0.27,
        0.65 - f32(i) * 0.17,
        0.85 - f32(i) * 0.22,
        1,
      );
    }
  }
  return { albedo: a, normal: vec4f(n * 0.5 + 0.5, a.a) };
}
export function lighting(
  albedo = "texture_2d<f32>",
  normal = "texture_2d<f32>",
  angle = "f32",
  mode = "u32",
) {
  const p = vec2i(position.xy);
  const a = textureLoad(albedo, p, 0);
  const packed = textureLoad(normal, p, 0);
  const n = normalize(packed.xyz * 2 - 1);
  const light = normalize(vec3f(cos(angle), sin(angle), 1));
  let rgb = a.rgb * (0.12 + 0.88 * max(dot(n, light), 0));
  if (mode == 1) rgb = a.rgb;
  if (mode == 2) rgb = packed.rgb;
  return vec4f(mix(vec3f(0.02, 0.03, 0.05), rgb, a.a), 1);
}
