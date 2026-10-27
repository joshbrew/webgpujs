// Menger sponge: shader functions are parsed into WGSL, never called on the CPU.

export function menger(time = "f32", zoom = "f32", pointer = "vec2f") {
  function sponge(p = "vec3f") {
    let distance = max(max(abs(p.x), abs(p.y)), abs(p.z)) - 1;
    let scale = f32(1);
    for (let j = 0; j < 3; j++) {
      const a = fract((p + vec3f(1)) * scale * 0.5) * 2 - vec3f(1);
      scale *= 3;
      const r = abs(vec3f(1) - abs(a) * 3);
      const hole =
        (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - 1) / scale;
      distance = max(distance, hole);
    }
    return distance;
  }
  const uv =
    (position.xy - vec2f(resX, resY) * 0.5) / resY / zoom + pointer * 0.25;
  const ray = normalize(vec3f(uv, -1.5));
  let travel = f32(0);
  let shade = f32(0);
  for (let i = 0; i < 90; i++) {
    const p = vec3f(0, 0, 3.5) + ray * travel;
    const angle = time * 0.15;
    const q = vec3f(
      cos(angle) * p.x + sin(angle) * p.z,
      p.y,
      -sin(angle) * p.x + cos(angle) * p.z,
    );
    const d = sponge(q);
    travel += d;
    if (d < 0.001) {
      shade = 1 - f32(i) / 90;
      break;
    }
    if (travel > 7) break;
  }
  return vec4f(vec3f(0.5, 0.85, 1) * shade, 1);
}
