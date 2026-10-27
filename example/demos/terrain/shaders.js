// Fractal terrain: shader functions are parsed into WGSL, never called on the CPU.

export function terrainNoise(time = "f32") {
  function hash(p = "vec2f") {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }
  function noise(p = "vec2f") {
    const i = floor(p);
    const f = fract(p);
    const u = f * f * (3 - 2 * f);
    return mix(
      mix(hash(i), hash(i + vec2f(1, 0)), u.x),
      mix(hash(i + vec2f(0, 1)), hash(i + vec2f(1, 1)), u.x),
      u.y,
    );
  }
  let p = (position.xy / resY) * 3 + vec2f(time * 0.08, 0);
  let amplitude = 0.5;
  let height = f32(0);
  for (let i = 0; i < 6; i++) {
    height += noise(p) * amplitude;
    p = p * 2.03 + vec2f(5.1);
    amplitude *= 0.5;
  }
  const land = mix(
    vec3f(0.02, 0.13, 0.3),
    vec3f(0.18, 0.65, 0.4),
    smoothstep(0.3, 0.65, height),
  );
  return vec4f(
    mix(land, vec3f(1, 0.9, 0.7), smoothstep(0.65, 0.85, height)),
    1,
  );
}
