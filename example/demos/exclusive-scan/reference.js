export function reference(input) {
  let sum = 0;
  return Float32Array.from(input.A, (v) => {
    const previous = sum;
    sum += v;
    return previous;
  });
}
