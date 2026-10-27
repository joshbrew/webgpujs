// Atomic histogram → summary → display: shader functions are parsed into WGSL, never called on the CPU.

export function histogramCompute(
  samples = "array<f32>",
  bins = "array<atomic<u32>>",
) {
  const i = threadId.x;
  if (i >= samples.length) return;
  const bin = u32(clamp(samples[i], 0, 0.99999) * 64);
  atomicAdd(bins[bin], 1);
}

export function histogramSummary(counts = "array<u32>", stats = "array<u32>") {
  let total = u32(0);
  let peak = u32(0);
  let weighted = u32(0);
  for (let i = 0; i < counts.length; i++) {
    total += counts[i];
    peak = max(peak, counts[i]);
    weighted += u32(i) * counts[i];
  }
  stats[0] = u32(total);
  stats[1] = u32(peak);
  stats[2] = u32(weighted);
  return stats;
}

export function histogramFragment(histogram = "array<u32>", maxCount = "f32") {
  const bin = min(u32((position.x / resX) * 64), 63);
  const height = f32(histogram[bin]) / max(maxCount, 1);
  const y = 1 - position.y / resY;
  if (y < height)
    return vec4f(0.2 + f32(bin) / 100, 0.9 - f32(bin) / 120, 0.85, 1);
  return vec4f(0.03, 0.06, 0.1, 1);
}
