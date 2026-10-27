// Shader functions are translated to WGSL, not executed as JavaScript.
export function envelope(
  input = "array<f32>",
  quadrature = "array<f32>",
  result = "array<f32>",
) {
  const i = threadId.x;
  if (i >= input.length) return;
  let q = f32(0);
  for (let k = i32(-15); k <= 15; k++) {
    if (k != 0 && abs(k) % 2 == 1) {
      const at = u32((i32(i) - k + i32(input.length)) % i32(input.length));
      const tap =
        (2 / (Math.PI * f32(k))) * (0.54 + 0.46 * cos((Math.PI * f32(k)) / 16));
      q += input[at] * tap;
    }
  }
  quadrature[i] = q;
  result[i] = sqrt(input[i] * input[i] + q * q);
}

export function display(input = "array<f32>", result = "array<f32>") {
  const uv = position.xy / vec2f(resX, resY);
  const at = uv.x * f32(result.length - 1),
    i = min(u32(at), result.length - 1),
    next = min(i + 1, result.length - 1),
    fraction = fract(at),
    carrierY = 0.25 - mix(input[i], input[next], fraction) * 0.18,
    envelopeY = 0.75 - mix(result[i], result[next], fraction) * 0.3;
  let colour = vec3f(0.02, 0.04, 0.08);
  if (abs(uv.y - 0.25) < 0.002 || abs(uv.y - 0.75) < 0.002)
    colour = vec3f(0.12, 0.2, 0.28);
  if (abs(uv.y - carrierY) < max(0.004, fwidth(carrierY) * 0.6))
    colour = vec3f(0.3, 0.85, 1);
  if (abs(uv.y - envelopeY) < max(0.004, fwidth(envelopeY) * 0.6))
    colour = vec3f(1, 0.7, 0.25);
  return vec4f(colour, 1);
}
