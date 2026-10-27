export function reference(input) {
  const m = Math.max(...input.input),
    w = Array.from(input.input, (v) => Math.exp((v - m) / input.temperature)),
    s = w.reduce((a, b) => a + b, 0);
  return new Float32Array(w.map((v) => v / s));
}
