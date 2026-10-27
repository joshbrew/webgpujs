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
export function windows(
  signalData = "array<f32>",
  next = "array<vec2f>",
  count = "u32",
  hop = "u32",
) {
  const i = threadId.x;
  if (i >= next.length) return;
  const frame = i / count,
    n = i % count;
  const weight = 0.5 - 0.5 * cos((2 * Math.PI * f32(n)) / f32(count - 1));
  next[i] = vec2f(signalData[frame * hop + n] * weight, 0);
}
export function magnitude(
  state = "array<vec2f>",
  result = "array<f32>",
  count = "u32",
  frames = "u32",
) {
  const i = threadId.x;
  if (i >= result.length) return;
  const frame = i % frames,
    bin = count / 2 - 1 - i / frames;
  result[i] = log(1 + length(state[frame * count + bin])) / 4;
}

export function display(values = "array<f32>", columns = "u32", scale = "f32") {
  const uv = position.xy / vec2f(resX, resY),
    rows = values.length / columns,
    cell = min(
      vec2u(uv * vec2f(f32(columns), f32(rows))),
      vec2u(columns - 1, rows - 1),
    ),
    value = clamp(values[cell.y * columns + cell.x] * scale, 0, 1);
  let colour = mix(
    vec3f(0.015, 0.025, 0.07),
    vec3f(0.15, 0.35, 0.8),
    clamp(value * 3, 0, 1),
  );
  colour = mix(colour, vec3f(0.9, 0.2, 0.45), clamp((value - 0.25) * 2, 0, 1));
  colour = mix(colour, vec3f(1, 0.85, 0.3), clamp((value - 0.65) * 3, 0, 1));
  return vec4f(colour, 1);
}
