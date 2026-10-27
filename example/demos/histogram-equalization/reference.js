export function reference(input) {
  const bins = new Uint32Array(256);
  for (const x of input.input) bins[Math.min(255, Math.floor(x * 256))]++;
  let total = 0,
    minimum = 0;
  const cdf = Array.from(bins, (n) => {
    total += n;
    if (!minimum && total) minimum = total;
    return total;
  });
  return Float32Array.from(input.input, (x) =>
    total > minimum
      ? (cdf[Math.min(255, Math.floor(x * 256))] - minimum) / (total - minimum)
      : x,
  );
}
