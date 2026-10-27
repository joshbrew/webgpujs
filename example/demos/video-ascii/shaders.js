// Media enters as a texture; these passes keep pixels and derived features in reusable buffers.
export function decodeFrame(
  image = "texture_2d<f32>",
  pixels = "array<vec4f>",
  width = "u32",
  height = "u32",
) {
  const i = threadId.x;
  if (i >= pixels.length) return;
  const size = textureDimensions(image);
  const uv =
    (vec2f(f32(i % width), f32(i / width)) + vec2f(0.5)) /
    vec2f(f32(width), f32(height));
  const at = min(vec2u(uv * vec2f(size)), size - vec2u(1));
  pixels[i] = textureLoad(image, vec2i(at), 0);
}

export function extractFeatures(
  pixels = "array<vec4f>",
  features = "array<vec2f>",
  width = "u32",
  height = "u32",
) {
  const i = threadId.x;
  if (i >= pixels.length) return;
  const x = i % width;
  const y = i / width;
  const luma = dot(pixels[i].rgb, vec3f(0.2126, 0.7152, 0.0722));
  let gx = f32(0);
  let gy = f32(0);
  for (let yy = -1; yy <= 1; yy++) {
    for (let xx = -1; xx <= 1; xx++) {
      const sx = u32(clamp(i32(x) + xx, 0, i32(width) - 1));
      const sy = u32(clamp(i32(y) + yy, 0, i32(height) - 1));
      const value = dot(
        pixels[sy * width + sx].rgb,
        vec3f(0.2126, 0.7152, 0.0722),
      );
      gx += value * f32(xx) * select(1.0, 2.0, yy == 0);
      gy += value * f32(yy) * select(1.0, 2.0, xx == 0);
    }
  }
  features[i] = vec2f(luma, clamp(length(vec2f(gx, gy)), 0, 1));
}

export function asciiDisplay(
  pixels = "array<vec4f>",
  features = "array<vec2f>",
  atlas = "texture_2d<f32>",
  width = "u32",
  height = "u32",
  columns = "f32",
  colorize = "u32",
  edgeMix = "f32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const panel = vec2f(fract(uv.x * 2), uv.y);
  const at = min(
    vec2u(panel * vec2f(f32(width), f32(height))),
    vec2u(width - 1, height - 1),
  );
  if (uv.x < 0.5) return vec4f(pixels[at.y * width + at.x].rgb, 1);
  const cells = vec2f(columns, max(1.0, (columns * f32(height)) / f32(width)));
  const cell = (floor(panel * cells) + vec2f(0.5)) / cells;
  const sample = min(
    vec2u(cell * vec2f(f32(width), f32(height))),
    vec2u(width - 1, height - 1),
  );
  const index = sample.y * width + sample.x;
  const brightness = clamp(
    features[index].x + features[index].y * edgeMix,
    0,
    0.999,
  );
  const glyph = u32(brightness * 10);
  const local = vec2u(fract(panel * cells) * vec2f(16, 24));
  const mask = textureLoad(
    atlas,
    vec2i(i32(glyph * 16 + local.x), i32(local.y)),
    0,
  ).r;
  const colour = select(vec3f(0.65, 1, 0.82), pixels[index].rgb, colorize == 1);
  return vec4f(vec3f(0.015, 0.025, 0.04) + colour * mask, 1);
}
