export function reference(input) {
  const out = new Float32Array(1024),
    alpha = (k) => (k === 0 ? Math.SQRT1_2 : 1);
  for (let by = 0; by < 32; by += 8)
    for (let bx = 0; bx < 32; bx += 8) {
      const c = new Float64Array(64);
      for (let v = 0; v < 8; v++)
        for (let u = 0; u < 8; u++) {
          let sum = 0;
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++)
              sum +=
                input.input[(by + y) * 32 + bx + x] *
                Math.cos((Math.PI * (x + 0.5) * u) / 8) *
                Math.cos((Math.PI * (y + 0.5) * v) / 8);
          const value = 0.25 * alpha(u) * alpha(v) * sum;
          c[v * 8 + u] =
            Math.round(value / input.quantization) * input.quantization;
        }
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          let sum = 0;
          for (let v = 0; v < 8; v++)
            for (let u = 0; u < 8; u++)
              sum +=
                alpha(u) *
                alpha(v) *
                c[v * 8 + u] *
                Math.cos((Math.PI * (x + 0.5) * u) / 8) *
                Math.cos((Math.PI * (y + 0.5) * v) / 8);
          out[(by + y) * 32 + bx + x] = sum * 0.25;
        }
    }
  return out;
}
