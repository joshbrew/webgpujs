export function reference(input) {
  let a = new Float32Array(64),
    b = new Float32Array(64);
  for (let k = 0; k < (input.iterations ?? 24); k++) {
    for (let i = 0; i < 64; i++)
      b[i] = 0.5 * (input.forcing[i] + (a[i - 1] ?? 0) + (a[i + 1] ?? 0));
    [a, b] = [b, a];
  }
  return a;
}
