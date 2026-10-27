// Refracted caustics: shader functions are parsed into WGSL, never called on the CPU.

export function caustics(time = "f32", zoom = "f32", pointer = "vec2f") {
  let p =
    (((position.xy - vec2f(resX, resY) * 0.5) / resY) * 5) / zoom + pointer;
  let intensity = f32(0);
  for (let i = 0; i < 5; i++) {
    const t = time * (0.2 + f32(i) * 0.03);
    p += vec2f(cos(p.y + t), sin(p.x - t));
    intensity += 1 / max(abs(sin(p.x) * cos(p.y)), 0.05);
  }
  const glow = pow(intensity / 60, 1.6);
  return vec4f(vec3f(0.05, 0.5, 0.7) * glow, 1);
}
