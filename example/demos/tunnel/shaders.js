// Polar tunnel: shader functions are parsed into WGSL, never called on the CPU.

export function polarTunnel(
  time = "f32",
  zoom = "f32",
  pointer = "vec2f",
  twist = "f32",
) {
  const p =
    (position.xy - vec2f(resX, resY) * 0.5) / resY / zoom -
    vec2f(pointer.x, -pointer.y) * 0.3;
  const r = max(length(p), 0.01);
  const a = atan2(p.y, p.x) + twist / r + pointer.x * 0.5;
  const tiles = sin(a * 12 + sin(1 / r - time)) * sin((1 / r) * 3 - time * 3);
  return vec4f(
    (0.5 + 0.5 * cos(vec3f(0, 2, 4) + tiles * 2 + time)) * min(r * 4, 1),
    1,
  );
}
