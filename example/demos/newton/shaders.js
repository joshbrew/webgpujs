// Newton basins: shader functions are parsed into WGSL, never called on the CPU.

export function newtonBasin(time = "f32", zoom = "f32", pointer = "vec2f") {
  let z =
    (((position.xy - vec2f(resX, resY) * 0.5) / resY) * 3) / zoom +
    pointer * 0.6;
  let iterations = f32(0);
  for (let i = 0; i < 40; i++) {
    const square = vec2f(z.x * z.x - z.y * z.y, 2 * z.x * z.y);
    const cube = vec2f(
      square.x * z.x - square.y * z.y,
      square.x * z.y + square.y * z.x,
    );
    const numerator = cube - vec2f(1, 0);
    const derivative = 3 * square;
    const denominator = max(dot(derivative, derivative), 0.00001);
    z -=
      vec2f(
        dot(numerator, derivative),
        numerator.y * derivative.x - numerator.x * derivative.y,
      ) / denominator;
    iterations += 1;
    if (length(numerator) < 0.0001) break;
  }
  const angle = atan2(z.y, z.x);
  return vec4f(
    (0.5 + 0.5 * cos(vec3f(0, 2, 4) + angle)) * exp(-iterations * 0.035),
    1,
  );
}
