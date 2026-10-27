export function reference(input) {
  function transform(a, axis, inverse) {
    const out = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const stride = axis ? 32 : 1,
        c = axis ? Math.floor(i / 32) : i % 32,
        base = i - c * stride;
      let p = inverse ? Math.floor(c / 2) : c % 16;
      const x = a[base + (inverse ? p : p * 2) * stride],
        y = a[base + (inverse ? p + 16 : p * 2 + 1) * stride];
      out[i] =
        (inverse ? (c % 2 ? x - y : x + y) : c >= 16 ? x - y : x + y) *
        Math.SQRT1_2;
    }
    return out;
  }
  let c = transform(transform(input.input, 0, false), 1, false);
  for (let i = 0; i < 1024; i++)
    if (
      (i % 32 >= 16 || Math.floor(i / 32) >= 16) &&
      Math.abs(c[i]) < input.threshold
    )
      c[i] = 0;
  return transform(transform(c, 1, true), 0, true);
}
