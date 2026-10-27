export function reference(input) {
  return Float32Array.from({ length: 256 }, (_, i) => {
    const r = Math.floor(i / 16),
      c = i % 16;
    let d = 0,
      a = 0,
      b = 0;
    for (let j = 0; j < 16; j++) {
      const x = input.vectors[r * 16 + j],
        y = input.vectors[c * 16 + j];
      d += x * y;
      a += x * x;
      b += y * y;
    }
    return d / Math.max(Math.sqrt(a * b), 0.00001);
  });
}
