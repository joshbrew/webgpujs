// FFT → filter → inverse FFT: shader functions are parsed into WGSL, never called on the CPU.

export function prepareSignal(
  signalData = "array<f32>",
  complex = "array<vec2f>",
  count = "u32",
  windowMix = "f32",
) {
  const i = threadId.x;
  if (i >= count) return;
  let reversed = u32(0);
  let bits = count;
  let value = i;
  while (bits > 1) {
    reversed = reversed * 2 + (value % 2);
    value /= 2;
    bits /= 2;
  }
  const hann = 0.5 - 0.5 * cos((2 * Math.PI * f32(i)) / f32(count - 1));
  complex[reversed] = vec2f(signalData[i] * mix(1.0, hann, windowMix), 0);
}

export function lowPassBins(state = "array<vec2f>", cutoff = "u32") {
  const i = threadId.x;
  if (i >= state.length) return;
  if (i > cutoff && i < state.length - cutoff) state[i] = vec2f(0);
}

export function reverseComplex(
  state = "array<vec2f>",
  next = "array<vec2f>",
  count = "u32",
) {
  const i = threadId.x;
  if (i >= count) return;
  let reversed = u32(0);
  let bits = count;
  let value = i;
  while (bits > 1) {
    reversed = reversed * 2 + (value % 2);
    value /= 2;
    bits /= 2;
  }
  next[reversed] = state[i];
}

export function realSignal(
  state = "array<vec2f>",
  result = "array<f32>",
  count = "u32",
) {
  const i = threadId.x;
  if (i < result.length) result[i] = state[i].x / f32(count);
}

export function signalDisplay(
  original = "array<f32>",
  processed = "array<f32>",
  spectrum = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const i = min(u32(uv.x * f32(original.length)), original.length - 1);
  let colour = vec3f(0.02, 0.04, 0.08);
  const top = 0.24 - original[i] * 0.18;
  if (abs(uv.y - top) < 0.008) colour = vec3f(0.3, 0.9, 1);
  if (spectrum == 1) {
    if (uv.y > 0.53 && uv.y > 0.98 - processed[i] * 0.42)
      colour = vec3f(0.9, 0.65, 0.3);
  } else {
    const bottom = 0.75 - processed[i] * 0.18;
    if (abs(uv.y - bottom) < 0.008) colour = vec3f(1, 0.65, 0.3);
  }
  if (abs(uv.y - 0.5) < 0.002) colour = vec3f(0.2, 0.3, 0.4);
  return vec4f(colour, 1);
}

export function fftPass(
  state = "array<vec2f>",
  next = "array<vec2f>",
  span = "u32",
  direction = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const halfSpan = span / 2;
  const lane = i % halfSpan;
  const base = (i / span) * span;
  const a = state[base + lane];
  const b = state[base + lane + halfSpan];
  const angle = (direction * 2 * Math.PI * f32(lane)) / f32(span);
  const rotated = vec2f(
    b.x * cos(angle) - b.y * sin(angle),
    b.x * sin(angle) + b.y * cos(angle),
  );
  next[i] = select(a - rotated, a + rotated, i % span < halfSpan);
}
