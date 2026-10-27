// Wave interference: shader functions are parsed into WGSL, never called on the CPU.

export function interference(time = "f32") {
  const p = (position.xy - vec2f(resX, resY) * 0.5) / resY;
  const a = sin(length(p - vec2f(-0.25, 0)) * 60 - time * 3);
  const b = sin(length(p - vec2f(0.25, 0)) * 60 - time * 3);
  return vec4f(0.5 + 0.5 * cos(vec3f(0, 2, 4) + (a + b) * 2), 1);
}
