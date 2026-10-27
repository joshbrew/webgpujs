export function reference(input) {
  return Float32Array.from(input.input, (value, i) => {
    let q = 0;
    for (let k = -15; k <= 15; k++)
      if (k && Math.abs(k) % 2 === 1)
        q +=
          ((input.input[(i - k + 256) % 256] * 2) / (Math.PI * k)) *
          (0.54 + 0.46 * Math.cos((Math.PI * k) / 16));
    return Math.hypot(value, q);
  });
}
