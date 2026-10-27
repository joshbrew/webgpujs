export function reference(input) {
  const out = new Float32Array(256).fill(-8),
    queue = [input.distances.indexOf(0)];
  out[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      x = i % 16,
      y = Math.floor(i / 16);
    for (const j of [
      x > 0 ? i - 1 : -1,
      x < 15 ? i + 1 : -1,
      y > 0 ? i - 16 : -1,
      y < 15 ? i + 16 : -1,
    ])
      if (j >= 0 && !input.walls[j] && out[j] < 0) {
        out[j] = out[i] + 1;
        queue.push(j);
      }
  }
  return out;
}
