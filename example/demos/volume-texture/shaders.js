export function display(
  volume = "texture_3d<f32>",
  volumeSampler = "sampler",
  angle = "f32",
  density = "f32",
) {
  const uv = position.xy / vec2f(resX, resY);
  let colour = vec3f(0.015, 0.025, 0.045),
    transmission = f32(1);
  for (let i = u32(0); i < 48; i++) {
    const p = vec3f(
      ((uv.x - 0.5) * resX) / resY,
      uv.y - 0.5,
      f32(i) / 47 - 0.5,
    );
    const q =
      vec3f(
        p.x * cos(angle) + p.z * sin(angle),
        p.y,
        -p.x * sin(angle) + p.z * cos(angle),
      ) + vec3f(0.5);
    if (q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1 && q.z >= 0 && q.z <= 1) {
      const value = textureSampleLevel(volume, volumeSampler, q, 0).r;
      const alpha = clamp(value * density * 0.06, 0, 0.8);
      colour +=
        transmission *
        alpha *
        vec3f(0.25 + q.z * 0.65, 0.4 + value * 0.5, 1 - q.z * 0.55);
      transmission *= 1 - alpha;
    }
  }
  return vec4f(colour, 1);
}
