// Procedural bump lighting: shader functions are parsed into WGSL, never called on the CPU.

export function bumpLighting(time = "f32") {
  function height(p = "vec2f") {
    return sin(p.x * 16 + time) * cos(p.y * 12 - time) * 0.12;
  }
  const p = (position.xy - vec2f(resX, resY) * 0.5) / resY;
  const dx = height(p + vec2f(0.001, 0)) - height(p - vec2f(0.001, 0));
  const dy = height(p + vec2f(0, 0.001)) - height(p - vec2f(0, 0.001));
  const n = normalize(vec3f(-dx * 500, -dy * 500, 1));
  const light = normalize(vec3f(sin(time), cos(time), 1));
  const diffuse = max(dot(n, light), 0);
  const specular = pow(max(dot(reflect(-light, n), vec3f(0, 0, 1)), 0), 40);
  return vec4f(vec3f(0.1, 0.5, 0.8) * diffuse + specular, 1);
}
