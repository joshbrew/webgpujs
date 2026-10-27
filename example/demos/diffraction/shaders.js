// Seven-slit diffraction: shader functions are parsed into WGSL, never called on the CPU.

export function diffraction(time = "f32", zoom = "f32", pointer = "vec2f") {
  const p = (((position.xy - vec2f(resX, resY) * 0.5) / resY) * 5) / zoom;
  const spacing = 0.4 + pointer.x * 0.25;
  let amplitude = f32(0);
  for (let i = 0; i < 7; i++) {
    const source = vec2f(-2, f32(i - 3) * spacing);
    amplitude += sin(length(p - source) * 35 - time * 2);
  }
  const brightness = (amplitude * amplitude) / 49;
  return vec4f(vec3f(0.3, 0.7, 1) * brightness, 1);
}
