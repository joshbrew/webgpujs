// One invocation owns one channel's sequential IIR state; channels execute in parallel.
export function generate(
  signal = "array<f32>",
  sampleCount = "u32",
  sampleRate = "f32",
  blockIndex = "u32",
  hum = "f32",
) {
  const i = threadId.x;
  if (i >= signal.length) return;
  const channel = i / sampleCount;
  const t = f32(blockIndex * sampleCount + (i % sampleCount)) / sampleRate;
  signal[i] =
    0.7 * sin(2 * Math.PI * f32(10 + (channel % 24)) * t) +
    hum * sin(2 * Math.PI * 60 * t) +
    0.35 * sin(2 * Math.PI * t);
}
export function biquad(
  source = "array<f32>",
  result = "array<f32>",
  state = "array<vec2f>",
  sampleCount = "u32",
  b0 = "f32",
  b1 = "f32",
  b2 = "f32",
  a1 = "f32",
  a2 = "f32",
) {
  const channel = threadId.x;
  if (channel >= state.length) return;
  let z = state[channel];
  for (let n = u32(0); n < sampleCount; n++) {
    const i = channel * sampleCount + n;
    const x = source[i];
    const y = b0 * x + z.x;
    z = vec2f(b1 * x - a1 * y + z.y, b2 * x - a2 * y);
    result[i] = y;
  }
  state[channel] = z;
}
export function display(
  original = "array<f32>",
  notched = "array<f32>",
  filtered = "array<f32>",
  sampleCount = "u32",
  channel = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const at = uv.x * f32(sampleCount - 1),
    sample = min(u32(at), sampleCount - 1),
    i = channel * sampleCount + sample,
    next = channel * sampleCount + min(sample + 1, sampleCount - 1),
    fraction = fract(at);
  const raw = mix(original[i], original[next], fraction),
    notch = mix(notched[i], notched[next], fraction),
    band = mix(filtered[i], filtered[next], fraction),
    rawY = 0.18 - raw * 0.07,
    notchY = 0.5 - notch * 0.11,
    bandY = 0.82 - band * 0.14;
  let colour = vec3f(0.02, 0.04, 0.08);
  if (
    abs(uv.y - 0.18) < 0.002 ||
    abs(uv.y - 0.5) < 0.002 ||
    abs(uv.y - 0.82) < 0.002
  )
    colour = vec3f(0.12, 0.2, 0.28);
  if (abs(uv.y - rawY) < max(0.004, fwidth(rawY) * 0.6))
    colour = vec3f(0.3, 0.85, 1);
  if (abs(uv.y - notchY) < max(0.004, fwidth(notchY) * 0.6))
    colour = vec3f(1, 0.68, 0.25);
  if (abs(uv.y - bandY) < max(0.004, fwidth(bandY) * 0.6))
    colour = vec3f(0.3, 1, 0.65);
  return vec4f(colour, 1);
}
