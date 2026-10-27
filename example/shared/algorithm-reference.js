// CPU references used to validate the GPU algorithms.
export function algorithmReference(mode, input) {
  if (mode === "reduction")
    return {
      total: new Float32Array([input.input.reduce((a, b) => a + b, 0)]),
    };
  if (mode === "matrix")
    return {
      product: Float32Array.from({ length: 256 }, (_, i) => {
        let sum = 0;
        for (let k = 0; k < 16; k++)
          sum +=
            input.left[Math.floor(i / 16) * 16 + k] *
            input.right[k * 16 + (i % 16)];
        return sum;
      }),
    };
  if (mode === "compact")
    return { packed: input.input.filter((v) => v > input.threshold) };
  if (mode === "correlation") return { best: 80 };
  if (mode === "nearest") {
    const distances = new Float32Array(128),
      neighbors = new Uint32Array(128);
    for (let i = 0; i < 128; i++) {
      let best = Infinity;
      for (let j = 0; j < 128; j++)
        if (i !== j) {
          const d = Math.hypot(
            input.points[i * 2] - input.points[j * 2],
            input.points[i * 2 + 1] - input.points[j * 2 + 1],
          );
          if (d < best) {
            best = d;
            distances[i] = d;
            neighbors[i] = j;
          }
        }
    }
    return { distances, neighbors };
  }
  if (mode === "rle") {
    const values = [],
      lengths = [];
    for (const value of input.input) {
      if (!values.length || values.at(-1) !== value) {
        values.push(value);
        lengths.push(1);
      } else lengths[lengths.length - 1]++;
    }
    return {
      "run-values": new Uint32Array(values),
      "run-lengths": new Uint32Array(lengths),
    };
  }
  if (mode === "integral")
    return {
      average: Float32Array.from({ length: 1024 }, (_, i) => {
        const x = i % 32,
          y = Math.floor(i / 32),
          r = input.radius;
        let sum = 0,
          count = 0;
        for (let yy = Math.max(0, y - r); yy <= Math.min(31, y + r); yy++)
          for (let xx = Math.max(0, x - r); xx <= Math.min(31, x + r); xx++) {
            sum += input["image-A"][yy * 32 + xx];
            count++;
          }
        return sum / count;
      }),
    };
  if (mode === "spatial") {
    const counts = new Uint32Array(64);
    for (let i = 0; i < 512; i++)
      counts[
        Math.min(7, Math.floor(input.points[i * 2 + 1] * 8)) * 8 +
          Math.min(7, Math.floor(input.points[i * 2] * 8))
      ]++;
    return { counts };
  }
}
