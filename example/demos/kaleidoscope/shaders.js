// Polar kaleidoscope: shader functions are parsed into WGSL, never called on the CPU.

export function kaleidoscope(time = "f32") {
  const p = (position.xy - vec2f(resX, resY) * 0.5) / resY;
  const radius = length(p);
  const angle = atan2(p.y, p.x);
  const sector = abs(fract((angle / (Math.PI * 2)) * 10 + time * 0.04) - 0.5);
  const pattern =
    sin(radius * 50 - time * 3 + sector * 14) * cos(sector * 24 + time);
  return vec4f(
    (0.5 + 0.5 * cos(vec3f(0, 2, 4) + pattern * 3)) *
      smoothstep(0.8, 0.1, radius),
    1,
  );
}
