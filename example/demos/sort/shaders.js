// Bitonic sorting network: shader functions are parsed into WGSL, never called on the CPU.

export function bitonicStep(
  data = "array<f32>",
  distance = "u32",
  sequence = "u32",
) {
  const i = threadId.x;
  if (i >= data.length) return;
  const partner = i ^ distance;
  if (partner > i && partner < data.length) {
    const a = data[i];
    const b = data[partner];
    const ascending = (i & sequence) == 0;
    data[i] = select(max(a, b), min(a, b), ascending);
    data[partner] = select(min(a, b), max(a, b), ascending);
  }
}

export function barsFragment(field = "array<f32>", scale = "f32") {
  const i = min(u32((position.x / resX) * f32(field.length)), field.length - 1);
  const value = field[i] / scale;
  const y = 1 - position.y / resY;
  if (y < value)
    return vec4f(0.2 + value * 0.7, 0.9 - value * 0.4, 1 - value * 0.3, 1);
  return vec4f(0.02, 0.04, 0.08, 1);
}
