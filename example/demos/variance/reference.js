export function reference(input) {
  const a = input.input,
    mean = a.reduce((s, v) => s + v, 0) / a.length,
    variance = a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length;
  return new Float32Array([mean, variance, Math.sqrt(variance)]);
}
