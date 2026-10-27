// Spheres and soft shadows: shader functions are parsed into WGSL, never called on the CPU.

export function sphereMarch(time = "f32") {
  function scene(p = "vec3f") {
    return min(length(p - vec3f(sin(time) * 0.6, 0, 0)) - 0.65, p.y + 0.8);
  }
  const uv = (position.xy - vec2f(resX, resY) * 0.5) / resY;
  const ray = normalize(vec3f(uv.x, -uv.y, -1.4));
  let t = f32(0);
  for (let i = 0; i < 72; i++) {
    const d = scene(vec3f(0, 0.3, 3) + ray * t);
    t += d;
    if (d < 0.001 || t > 10) break;
  }
  if (t > 10) return vec4f(0.03, 0.06, 0.13, 1);
  const p = vec3f(0, 0.3, 3) + ray * t;
  const e = 0.002;
  const normal = normalize(
    vec3f(
      scene(p + vec3f(e, 0, 0)) - scene(p - vec3f(e, 0, 0)),
      scene(p + vec3f(0, e, 0)) - scene(p - vec3f(0, e, 0)),
      scene(p + vec3f(0, 0, e)) - scene(p - vec3f(0, 0, e)),
    ),
  );
  const light = normalize(vec3f(-0.5, 1, 0.8));
  let shadow = f32(1);
  let stepDistance = 0.02;
  for (let i = 0; i < 28; i++) {
    const d = scene(p + normal * 0.01 + light * stepDistance);
    shadow = min(shadow, (12 * d) / stepDistance);
    stepDistance += clamp(d, 0.02, 0.15);
  }
  const diffuse = max(dot(normal, light), 0.1) * clamp(shadow, 0.15, 1);
  return vec4f(vec3f(0.2, 0.7, 1) * diffuse, 1);
}
