// 256 channels · notch + bandpass: shader functions are parsed into WGSL, never called on the CPU.

export function channelFilterDisplay(
  original = "array<f32>",
  notched = "array<f32>",
  filtered = "array<f32>",
  spectrum = "array<vec2f>",
  notchBins = "array<vec2f>",
  bandBins = "array<vec2f>",
  sampleCount = "u32",
  sampleRate = "f32",
  channelCount = "u32",
  selectedChannel = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  let colour = vec3f(0.025, 0.045, 0.075);
  const channel = min(selectedChannel, channelCount - 1);
  if (uv.y < 0.48) {
    const sample = min(u32(uv.x * f32(sampleCount)), sampleCount - 1);
    const i = channel * sampleCount + sample;
    const rawY = 0.08 - original[i] * 0.028;
    const notchY = 0.24 - notched[i] * 0.028;
    const bandY = 0.4 - filtered[i] * 0.028;
    if (abs(uv.y - rawY) < 0.004) colour = vec3f(0.3, 0.85, 1);
    if (abs(uv.y - notchY) < 0.004) colour = vec3f(1, 0.68, 0.25);
    if (abs(uv.y - bandY) < 0.004) colour = vec3f(0.65, 1, 0.5);
  } else if (uv.y < 0.75) {
    const frequency = uv.x * 100;
    const bin = min(
      u32((frequency * f32(sampleCount)) / sampleRate),
      sampleCount / 2,
    );
    const i = channel * sampleCount + bin;
    const rawHeight = (length(spectrum[i]) * 2) / f32(sampleCount);
    const notchHeight = (length(notchBins[i]) * 2) / f32(sampleCount);
    const bandHeight = (length(bandBins[i]) * 2) / f32(sampleCount);
    const y = (0.74 - uv.y) / 0.24;
    if (y < rawHeight) colour = vec3f(0.13, 0.4, 0.6);
    if (y < notchHeight) colour = vec3f(0.75, 0.44, 0.13);
    if (y < bandHeight) colour = vec3f(0.5, 0.9, 0.35);
    if (abs(frequency - 60) < 0.3) colour += vec3f(0.18, 0.08, 0.05);
  } else {
    const row = min(
      u32(((uv.y - 0.75) * f32(channelCount)) / 0.25),
      channelCount - 1,
    );
    const sample = min(u32(uv.x * f32(sampleCount)), sampleCount - 1);
    const value = filtered[row * sampleCount + sample];
    colour =
      vec3f(0.08, 0.16, 0.25) +
      max(value, 0) * vec3f(0.15, 0.7, 0.5) +
      max(-value, 0) * vec3f(0.55, 0.2, 0.4);
    if (row == channel) colour += vec3f(0.3);
  }
  return vec4f(colour, 1);
}

export function synthesizeChannels(
  signalData = "array<f32>",
  sampleCount = "u32",
  sampleRate = "f32",
  hum = "f32",
) {
  const i = threadId.x;
  if (i >= signalData.length) return;
  const channel = i / sampleCount;
  const t = f32(i % sampleCount) / sampleRate;
  const phase = f32(channel) * 0.17;
  const frequency = f32(10 + (channel % 24));
  signalData[i] =
    0.7 * sin(2 * Math.PI * frequency * t + phase) +
    0.25 * sin(2 * Math.PI * 25 * t - phase) +
    0.4 * sin(2 * Math.PI * t) +
    hum * sin(2 * Math.PI * 60 * t + phase) +
    0.3 * sin(2 * Math.PI * 90 * t);
}

export function packComplex(signalData = "array<f32>", next = "array<vec2f>") {
  const i = threadId.x;
  if (i < signalData.length) next[i] = vec2f(signalData[i], 0);
}

export function notchSpectrum(
  state = "array<vec2f>",
  spectrum = "array<vec2f>",
  notched = "array<vec2f>",
  sampleCount = "u32",
  sampleRate = "f32",
  notchHz = "f32",
  notchWidth = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const bin = i % sampleCount;
  const frequency =
    (f32(min(bin, sampleCount - bin)) * sampleRate) / f32(sampleCount);
  spectrum[i] = state[i];
  notched[i] =
    state[i] * select(1.0, 0.0, abs(frequency - notchHz) <= notchWidth * 0.5);
}

export function bandpassSpectrum(
  state = "array<vec2f>",
  next = "array<vec2f>",
  sampleCount = "u32",
  sampleRate = "f32",
  lowHz = "f32",
  highHz = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const bin = i % sampleCount;
  const frequency =
    (f32(min(bin, sampleCount - bin)) * sampleRate) / f32(sampleCount);
  next[i] =
    state[i] * select(0.0, 1.0, frequency >= lowHz && frequency <= highHz);
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
