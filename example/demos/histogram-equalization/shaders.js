// Shader functions are translated to WGSL, not executed as JavaScript.
export function clear(bins = "array<atomic<u32>>") {
  const i = threadId.x;
  if (i < bins.length) atomicStore(bins[i], u32(0));
}
export function histogram(input = "array<f32>", bins = "array<atomic<u32>>") {
  const i = threadId.x;
  if (i < input.length)
    atomicAdd(bins[min(u32(input[i] * 256), u32(255))], u32(1));
}
export function snapshot(bins = "array<atomic<u32>>", counts = "array<u32>") {
  const i = threadId.x;
  if (i < counts.length) counts[i] = atomicLoad(bins[i]);
}
export function scan(
  state = "array<u32>",
  next = "array<u32>",
  offset = "u32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  let count = state[i];
  if (i >= offset) count += state[i - offset];
  next[i] = count;
}
export function firstCount(cdf = "array<u32>", minimum = "array<u32>") {
  if (threadId.x > 0) return;
  minimum[0] = 0;
  for (let j = u32(0); j < cdf.length; j++)
    if (cdf[j] > 0) {
      minimum[0] = cdf[j];
      break;
    }
}
export function equalize(
  input = "array<f32>",
  cdf = "array<u32>",
  minimum = "array<u32>",
  result = "array<f32>",
) {
  const i = threadId.x;
  if (i >= input.length) return;
  const bin = min(u32(input[i] * 256), u32(255));
  let value = input[i];
  if (input.length > minimum[0])
    value = f32(cdf[bin] - minimum[0]) / f32(input.length - minimum[0]);
  result[i] = value;
}

export function display(input = "array<f32>", result = "array<f32>") {
  const uv = position.xy / vec2f(resX, resY);
  const p = min(vec2u(vec2f(fract(uv.x * 2), uv.y) * 64), vec2u(63));
  const i = p.y * 64 + p.x;
  let value = result[i];
  if (uv.x < 0.5) value = input[i];
  return vec4f(vec3f(value), 1);
}
