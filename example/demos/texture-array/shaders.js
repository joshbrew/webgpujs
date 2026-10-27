export function display(
  frames = "texture_2d_array<f32>",
  frameSampler = "sampler",
  layer = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  return textureSampleLevel(frames, frameSampler, uv, i32(layer), 0);
}
