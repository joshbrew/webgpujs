// Gyroid volume: shader functions are parsed into WGSL, never called on the CPU.

export function gyroid(time = "f32", zoom = "f32", pointer = "vec2f") {
  const uv =
    (position.xy - vec2f(resX, resY) * 0.5) / resY / zoom + pointer * 0.3;
  const ray = normalize(vec3f(uv, -1.2));
  let travel = f32(0);
  let glow = f32(0);
  for (let i = 0; i < 72; i++) {
    const p = vec3f(0, 0, 3) + ray * travel + vec3f(time * 0.15, 0, 0);
    const q = p * 3;
    const distance = abs(dot(sin(q), cos(q.yzx))) / 5 + 0.006;
    glow += exp(-distance * 45) * 0.015;
    travel += distance;
    if (travel > 6) break;
  }
  return vec4f(vec3f(0.15, 0.6, 1) * glow, 1);
}
