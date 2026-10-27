// Independent CPU Lloyd iteration reference, including partial convergence and empty clusters.
export function reference(input) {
  let centers = Float32Array.from(input["centers-A"]),
    labels = new Uint32Array(256);
  function assign() {
    for (let i = 0; i < 256; i++) {
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const d =
          (input.points[i * 2] - centers[k * 2]) ** 2 +
          (input.points[i * 2 + 1] - centers[k * 2 + 1]) ** 2;
        if (d < best) {
          best = d;
          labels[i] = k;
        }
      }
    }
  }
  for (let iteration = 0; iteration < input.iterations; iteration++) {
    assign();
    const next = Float32Array.from(centers);
    for (let k = 0; k < 3; k++) {
      let x = 0,
        y = 0,
        count = 0;
      for (let i = 0; i < 256; i++)
        if (labels[i] === k) {
          x += input.points[i * 2];
          y += input.points[i * 2 + 1];
          count++;
        }
      if (count) {
        next[k * 2] = x / count;
        next[k * 2 + 1] = y / count;
      }
    }
    centers = next;
  }
  assign();
  return labels;
}
