// Implicit compute chain: shader functions are parsed into WGSL, never called on the CPU.

export function scaleSamples(samples = "array<f32>", multiplier = "f32") {
  const i = threadId.x;
  if (i < samples.length) samples[i] *= multiplier;
  return samples;
}

export function offsetSamples(offset = "f32", samples = "array<f32>") {
  const i = threadId.x;
  if (i < samples.length) samples[i] += offset;
  return samples;
}
