// Metaball field: shader functions are parsed into WGSL, never called on the CPU.

export function metaballs(time = "f32") {
  const p = (position.xy - vec2f(resX, resY) * 0.5) / resY;
  let field = f32(0);
  for (let i = 0; i < 8; i++) {
    const phase = f32(i) * 2.4;
    const center =
      vec2f(sin(time * 0.7 + phase), cos(time * 0.5 + phase * 1.3)) * 0.3;
    field += 0.012 / max(dot(p - center, p - center), 0.0001);
  }
  const edge = smoothstep(0.9, 1.05, field);
  return vec4f(
    mix(
      vec3f(0.03, 0.05, 0.12),
      vec3f(0.8, 0.2, 0.8) + sin(field * 2) * 0.1,
      edge,
    ),
    1,
  );
}
