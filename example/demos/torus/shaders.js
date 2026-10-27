// Raymarched torus: shader functions are parsed into WGSL, never called on the CPU.

export function torusMarch(time = "f32") {
  function distanceField(p = "vec3f") {
    const q = vec2f(length(p.xz) - 0.7, p.y);
    return length(q) - 0.22;
  }
  const uv = (position.xy - vec2f(resX, resY) * 0.5) / resY;
  const ray = normalize(vec3f(uv, -1.3));
  let distanceAlong = f32(0);
  let p = vec3f(0);
  for (let i = 0; i < 80; i++) {
    p = vec3f(0, 0, 3) + ray * distanceAlong;
    const q = vec3f(
      p.x,
      cos(time * 0.5) * p.y - sin(time * 0.5) * p.z,
      sin(time * 0.5) * p.y + cos(time * 0.5) * p.z,
    );
    const d = distanceField(q);
    distanceAlong += d;
    if (d < 0.001 || distanceAlong > 7) break;
  }
  if (distanceAlong > 7) return vec4f(0.02, 0.04, 0.08, 1);
  return vec4f(0.4 + 0.4 * cos(p * 3 + time), 1);
}
