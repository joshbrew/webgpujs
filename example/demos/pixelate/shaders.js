// Pixelation: shader functions are parsed into WGSL, never called on the CPU.

export function pixelateImage(amount = "f32") {
  const size = vec2i(textureDimensions(source));
  const p = vec2i(threadId.xy);
  if (p.x >= size.x || p.y >= size.y) return;
  const block = max(i32(amount * 18), 1);
  const q = (p / block) * block;
  textureStore(smoothed, p, textureLoad(source, q, 0));
}

export function generateTexture(time = "f32") {
  const size = textureDimensions(destination);
  if (threadId.x >= size.x || threadId.y >= size.y) return;
  const uv = vec2f(threadId.xy) / vec2f(size);
  const wave = sin(uv.x * 38 + time) * cos(uv.y * 31 - time);
  const rgb = vec3f(
    0.5 + 0.5 * wave,
    0.5 + 0.5 * sin(uv.y * 14 + time),
    0.5 + 0.5 * cos(uv.x * 12 - time),
  );
  textureStore(destination, vec2i(threadId.xy), vec4f(rgb, 1));
}

export function textureVertex() {
  const corners = [vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)];
  const point = corners[vertexIndex];
  position = vec4f(point, 0, 1);
  uv = point * vec2f(0.5, -0.5) + vec2f(0.5);
}

export function textureFragment() {
  return textureSample(displayImage, imageSampler, uv);
}
