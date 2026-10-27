// Shader functions are translated to WGSL, not executed as JavaScript.
export function blockConvolution(
  input = "array<f32>",
  taps = "array<f32>",
  partials = "array<f32>",
  blockSize = "u32",
  outputSize = "u32",
) {
  const i = threadId.x;
  if (i >= partials.length) return;
  const block = i / outputSize,
    at = i % outputSize;
  let sum = f32(0);
  for (let k = u32(0); k < taps.length; k++) {
    const source = i32(at) - i32(k);
    if (source >= 0 && source < i32(blockSize))
      sum += input[block * blockSize + u32(source)] * taps[k];
  }
  partials[i] = sum;
}
export function addTails(
  partials = "array<f32>",
  result = "array<f32>",
  blockSize = "u32",
  outputSize = "u32",
  blocks = "u32",
) {
  const i = threadId.x;
  if (i >= result.length) return;
  let sum = f32(0);
  for (let block = u32(0); block < blocks; block++) {
    const at = i32(i) - i32(block * blockSize);
    if (at >= 0 && at < i32(outputSize))
      sum += partials[block * outputSize + u32(at)];
  }
  result[i] = sum;
}

export function display(input = "array<f32>", result = "array<f32>") {
  const uv = position.xy / vec2f(resX, resY);
  const at = uv.x * f32(result.length - 1),
    i = min(u32(at), result.length - 1),
    next = min(i + 1, result.length - 1),
    fraction = fract(at);
  let original = f32(0);
  if (i < input.length)
    original = mix(input[i], input[min(i + 1, input.length - 1)], fraction);
  const inputY = 0.25 - original * 0.16,
    outputY = 0.75 - mix(result[i], result[next], fraction) * 0.16;
  let colour = vec3f(0.02, 0.04, 0.08);
  if (abs(uv.y - 0.25) < 0.002 || abs(uv.y - 0.75) < 0.002)
    colour = vec3f(0.12, 0.2, 0.28);
  if (abs(uv.y - inputY) < max(0.004, fwidth(inputY) * 0.6))
    colour = vec3f(0.25, 0.85, 1);
  if (abs(uv.y - outputY) < max(0.004, fwidth(outputY) * 0.6))
    colour = vec3f(1, 0.7, 0.25);
  return vec4f(colour, 1);
}
