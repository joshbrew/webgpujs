// Shader functions are translated to WGSL, not executed as JavaScript.
export function packComplex(signalData = "array<f32>", next = "array<vec2f>") {
  const i = threadId.x;
  if (i < signalData.length) next[i] = vec2f(signalData[i], 0);
}
export function unpackReal(
  state = "array<vec2f>",
  result = "array<f32>",
  normalization = "f32",
) {
  const i = threadId.x;
  if (i < result.length) result[i] = state[i].x / normalization;
}
export function reverseFFTAxis(
  state = "array<vec2f>",
  next = "array<vec2f>",
  axisLength = "u32",
  stride = "u32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const coordinate = (i / stride) % axisLength;
  let value = coordinate;
  let reversed = u32(0);
  let bits = axisLength;
  while (bits > 1) {
    reversed = reversed * 2 + (value % 2);
    value /= 2;
    bits /= 2;
  }
  next[i - coordinate * stride + reversed * stride] = state[i];
}
export function fftAxisButterfly(
  state = "array<vec2f>",
  next = "array<vec2f>",
  axisLength = "u32",
  stride = "u32",
  span = "u32",
  direction = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const coordinate = (i / stride) % axisLength;
  const halfSpan = span / 2;
  const lane = coordinate % halfSpan;
  const base =
    i - coordinate * stride + ((coordinate / span) * span + lane) * stride;
  const a = state[base];
  const b = state[base + halfSpan * stride];
  const angle = (direction * 2 * Math.PI * f32(lane)) / f32(span);
  const rotated = vec2f(
    b.x * cos(angle) - b.y * sin(angle),
    b.x * sin(angle) + b.y * cos(angle),
  );
  next[i] = select(a - rotated, a + rotated, coordinate % span < halfSpan);
}
export function copySpectrum(state = "array<vec2f>", next = "array<vec2f>") {
  const i = threadId.x;
  if (i < state.length) next[i] = state[i];
}
export function crossPower(
  a = "array<vec2f>",
  b = "array<vec2f>",
  next = "array<vec2f>",
) {
  const i = threadId.x;
  if (i >= next.length) return;
  const x = a[i],
    y = b[i];
  const cross = vec2f(x.x * y.x + x.y * y.y, x.x * y.y - x.y * y.x);
  next[i] = cross / max(length(cross), 0.000001);
}
export function estimate(
  correlation = "array<f32>",
  shift = "array<f32>",
  width = "u32",
) {
  if (threadId.x > 0) return;
  let best = f32(-1e30);
  let index = u32(0);
  for (let j = u32(0); j < correlation.length; j++)
    if (correlation[j] > best) {
      best = correlation[j];
      index = j;
    }
  let x = i32(index % width),
    y = i32(index / width);
  if (x > i32(width) / 2) x -= i32(width);
  if (y > i32(width) / 2) y -= i32(width);
  shift[0] = f32(x);
  shift[1] = f32(y);
}

export function display(
  values = "array<f32>",
  firstImage = "array<f32>",
  movedImage = "array<f32>",
  columns = "u32",
  scale = "f32",
) {
  const uv = position.xy / vec2f(resX, resY),
    panel = min(u32(uv.x * 3), u32(2)),
    q = vec2f(fract(uv.x * 3), uv.y),
    cell = min(vec2u(q * f32(columns)), vec2u(columns - 1)),
    i = cell.y * columns + cell.x;
  let colour = vec3f(firstImage[i]);
  if (panel == 1) colour = vec3f(movedImage[i]);
  if (panel == 2) {
    const value = max(values[i] * scale, 0);
    colour = vec3f(0.025, 0.05, 0.1) + sqrt(value) * vec3f(1, 0.7, 0.2);
  }
  if (fract(uv.x * 3) < 0.025) colour = vec3f(0.3, 0.4, 0.5);
  return vec4f(colour, 1);
}
