export function reference(input) {
  return Float32Array.from({ length: 1024 }, (_, i) => {
    const x = i % 32,
      y = Math.floor(i / 32);
    let sum = 0;
    for (let yy = -1; yy <= 1; yy++)
      for (let xx = -1; xx <= 1; xx++)
        sum +=
          input.input[
            Math.max(0, Math.min(31, y + yy)) * 32 +
              Math.max(0, Math.min(31, x + xx))
          ] * input.kernel[(yy + 1) * 3 + xx + 1];
    return sum;
  });
}
