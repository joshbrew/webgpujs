// CPU direct-form-II reference; callers retain the state array between blocks.
export function filterBlock(source, coefficients, state, sampleCount = 128) {
  const out = new Float32Array(source.length),
    { b0, b1, b2, a1, a2 } = coefficients;
  for (let channel = 0; channel < state.length / 2; channel++) {
    let z1 = state[channel * 2],
      z2 = state[channel * 2 + 1];
    for (let n = 0; n < sampleCount; n++) {
      const i = channel * sampleCount + n,
        x = source[i],
        y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      out[i] = y;
    }
    state[channel * 2] = z1;
    state[channel * 2 + 1] = z2;
  }
  return out;
}
