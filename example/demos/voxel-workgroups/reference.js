export function reference(input) {
  return Float32Array.from({ length: 32768 }, (_, i) => {
    const x = ((i % 32) / 32) * 2 - 1,
      y = ((Math.floor(i / 32) % 32) / 32) * 2 - 1,
      z = (Math.floor(i / 1024) / 32) * 2 - 1,
      f = input.frequency * 3;
    return 0.5 + 0.5 * Math.sin(x * f) * Math.cos(y * f) * Math.sin(z * f);
  });
}
