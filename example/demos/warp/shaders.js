// Domain warping: shader functions are parsed into WGSL, never called on the CPU.

export function domainWarp(time = "f32") {
  const p = ((position.xy - vec2f(resX, resY) * 0.5) / resY) * 5;
  const q = vec2f(sin(p.x * 1.7 + time), cos(p.y * 1.3 - time));
  const r = vec2f(sin(p.y + q.x * 2 + time * 0.3), cos(p.x + q.y * 3));
  const field = sin(p.x + r.x * 2) * cos(p.y + r.y * 2);
  return vec4f(0.5 + 0.5 * cos(vec3f(0, 2, 4) + field * 4 + time * 0.2), 1);
}
