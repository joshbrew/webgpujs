export function reference(input) {
  const out = new Float32Array(256);
  for (let r = 0; r < 16; r++) {
    const a = input.input.slice(r * 16, r * 16 + 16),
      m = a.reduce((s, v) => s + v, 0) / 16,
      v = a.reduce((s, x) => s + (x - m) ** 2, 0) / 16;
    for (let j = 0; j < 16; j++)
      out[r * 16 + j] = (a[j] - m) / Math.sqrt(v + 0.00001);
  }
  return out;
}
