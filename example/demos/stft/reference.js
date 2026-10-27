export function reference(input) {
  return Float32Array.from({ length: 1024 }, (_, i) => {
    const frame = i % 16,
      k = 63 - Math.floor(i / 16);
    let re = 0,
      im = 0;
    for (let n = 0; n < 128; n++) {
      const value =
          input.signal[frame * 32 + n] *
          (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / 127)),
        phase = (2 * Math.PI * k * n) / 128;
      re += value * Math.cos(phase);
      im -= value * Math.sin(phase);
    }
    return Math.log(1 + Math.hypot(re, im)) / 4;
  });
}
