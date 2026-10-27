// Julia orbit: shader functions are parsed into WGSL, never called on the CPU.

export function julia(time = "f32") {
  let z = ((position.xy - vec2f(resX, resY) * 0.5) / resY) * 3;
  const c = vec2f(
    -0.76 + sin(time * 0.13) * 0.05,
    0.19 + cos(time * 0.17) * 0.06,
  );
  let count = f32(0);
  for (let i = 0; i < 96; i++) {
    z = vec2f(z.x * z.x - z.y * z.y, 2 * z.x * z.y) + c;
    if (dot(z, z) > 16) break;
    count += 1;
  }
  return vec4f(0.5 + 0.5 * cos(vec3f(0, 2, 4) + count * 0.16), 1);
}
