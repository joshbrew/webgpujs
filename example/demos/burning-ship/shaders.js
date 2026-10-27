// Burning Ship: shader functions are parsed into WGSL, never called on the CPU.

export function burningShip(time = "f32") {
  const zoom = 1 + sin(time * 0.1) * 0.35;
  const c =
    ((position.xy / vec2f(resX, resY) - vec2f(0.5)) * vec2f(3, 2)) / zoom +
    vec2f(-0.5, -0.4);
  let z = vec2f(0);
  let count = f32(0);
  for (let i = 0; i < 90; i++) {
    z = abs(z);
    z = vec2f(z.x * z.x - z.y * z.y, 2 * z.x * z.y) + c;
    if (dot(z, z) > 4) break;
    count += 1;
  }
  return vec4f(pow(count / 90, 0.35), count / 150, count / 400, 1);
}
