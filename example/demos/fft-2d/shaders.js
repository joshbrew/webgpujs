// 2D FFT → spatial filtering → inverse: shader functions are parsed into WGSL, never called on the CPU.

export function fftImageDisplay(
  original = "array<f32>",
  spectrum = "array<vec2f>",
  filtered = "array<f32>",
  width = "u32",
  height = "u32",
  contrast = "f32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const panel = min(u32(uv.x * 3), 2);
  const x = min(u32(fract(uv.x * 3) * f32(width)), width - 1);
  const y = min(u32(uv.y * f32(height)), height - 1);
  let value = original[y * width + x];
  if (panel == 1) {
    const shiftedX = (x + width / 2) % width;
    const shiftedY = (y + height / 2) % height;
    value =
      (log2(1 + length(spectrum[shiftedY * width + shiftedX])) * contrast) / 12;
    return vec4f(value * 0.4, value * 0.9, value, 1);
  }
  if (panel == 2) value = filtered[y * width + x];
  return vec4f(vec3f(clamp(value, 0, 1)), 1);
}

export function synthesizeFFTImage(
  image = "array<f32>",
  width = "u32",
  height = "u32",
  stripeFrequency = "f32",
) {
  const i = threadId.x;
  if (i >= image.length) return;
  const x = f32(i % width) / f32(width);
  const y = f32(i / width) / f32(height);
  image[i] =
    0.5 +
    0.22 * cos(2 * Math.PI * 4 * x) +
    0.16 * sin(2 * Math.PI * 6 * y) +
    0.1 * cos(2 * Math.PI * stripeFrequency * (x + y));
}

export function packComplex(signalData = "array<f32>", next = "array<vec2f>") {
  const i = threadId.x;
  if (i < signalData.length) next[i] = vec2f(signalData[i], 0);
}

export function lowpassSpectrum2D(
  state = "array<vec2f>",
  spectrum = "array<vec2f>",
  next = "array<vec2f>",
  width = "u32",
  height = "u32",
  cutoff = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const x = i % width;
  const y = i / width;
  const radius = length(vec2f(f32(min(x, width - x)), f32(min(y, height - y))));
  spectrum[i] = state[i];
  next[i] = state[i] * select(0.0, 1.0, radius <= cutoff);
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
