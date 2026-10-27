export function display(
  image = "texture_2d<f32>",
  imageSampler = "sampler",
  lod = "f32",
  tiling = "f32",
) {
  const uv = position.xy / vec2f(resX, resY);
  return textureSampleLevel(image, imageSampler, uv * tiling, lod);
}
