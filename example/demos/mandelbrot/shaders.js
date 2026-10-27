// Mandelbrot: shader functions are parsed into WGSL, never called on the CPU.

export function mandelbrot(zoom = "f32", offset = "vec2f") {
  const c =
    ((position.xy / vec2f(resX, resY) - vec2f(0.5)) * vec2f(3.4, 2.2)) / zoom +
    offset;
  let z = vec2f(0);
  let iteration = 0;
  for (let i = 0; i < 100; i++) {
    z = vec2f(z.x * z.x - z.y * z.y, 2 * z.x * z.y) + c;
    if (dot(z, z) > 4) break;
    iteration++;
  }
  const shade = f32(iteration) / 100;
  return vec4f(
    0.5 + 0.5 * cos(3 + shade * 15),
    shade,
    0.5 + 0.5 * sin(shade * 9),
    1,
  );
}
