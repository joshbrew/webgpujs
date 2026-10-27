// Animated Voronoi: shader functions are parsed into WGSL, never called on the CPU.

export function voronoi(time = "f32") {
  const p = (position.xy / resY) * 7;
  const cell = floor(p);
  const local = fract(p);
  let nearest = f32(10);
  let id = f32(0);
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      const offset = vec2f(f32(x), f32(y));
      const hash = fract(
        sin(dot(cell + offset, vec2f(127.1, 311.7))) * 43758.5453,
      );
      const point = offset + 0.5 + sin(vec2f(hash * 6, hash * 9) + time) * 0.4;
      const d = length(point - local);
      if (d < nearest) {
        nearest = d;
        id = hash;
      }
    }
  }
  return vec4f(
    (0.5 + 0.5 * cos(vec3f(0, 2, 4) + id * 9)) * smoothstep(0, 0.08, nearest),
    1,
  );
}
